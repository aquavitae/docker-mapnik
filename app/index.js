const Express = require('express')
const mapnik = require('mapnik');
const bodyParser = require('body-parser');
const morgan = require('morgan')
const Promise = require('bluebird');
const request = require('request-promise');

const app = new Express();

// If defined, use WMS_URL to get a background image
const wmsUrl = process.env.WMS_URL;
const wmsLayers = process.env.WMS_LAYERS;
const wmsStyles = process.env.WMS_STYLES;
const wmsSrs = process.env.WMS_SRS;

// register fonts and datasource plugins
mapnik.register_default_fonts();
mapnik.register_default_input_plugins();

/**
 * If WMS_URL is defined, fetch the specified background image.
 * If not, return an empty image
 */
function getWmsImage(width, height, extent) {
  if (wmsUrl) {
    const bbox = extent.join(',');
    return request(`${wmsUrl}/GetMap`, {
      qs: {
        bbox: bbox,
        format: 'image/jpeg',
        height: height,
        layers: wmsLayers,
        request: 'GetMap',
        'srs(crs)': wmsSrs,
        styles: wmsStyles,
        version: 1.1,
        width: width,
      },
      encoding: null
    }).then(res => {
      return mapnik.Image.fromBytesSync(res);
    });
  } else {
    return Promise.resolve(new mapnik.Image(width, height));
  }
}

// Configure request logging
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.send('ok!');
});

app.post('/render', bodyParser.text({ type: 'text/xml' }), (req, res) => {
  // Get width and height from query parameters
  const width = req.query.width || 200;
  const height = req.query.height || 200;

  // Load the template from the request body and create a map
  const template = req.body;
  const map = new mapnik.Map(width, height);
  map.fromStringSync(template);
  map.zoomAll();

  // Create a new image using the map
  const image = new mapnik.Image(width, height);
  Promise.props({
    wms: getWmsImage(width, height, map.extent),
    layers: Promise.promisify(map.render, { context: map })(image),
  }).then(x => {
    // Make sure the images are premultiplied
    if (!x.wms.premultiplied()) {
      x.wms.premultiplySync();
    }
    if (!x.layers.premultiplied()) {
      x.layers.premultiplySync();
    }
    return x;
  }).then(x => Promise.promisify(x.wms.composite, { context: x.wms })(x.layers))
    .then(image => Promise.promisify(image.encode, { context: image })('png'))
    .then(buffer => {
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  }).catch(err => {
    throw err
  });
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
