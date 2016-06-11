const Express = require('express')
const mapnik = require('mapnik');
const bodyParser = require('body-parser');
const morgan = require('morgan')
const Promise = require('bluebird');
const request = require('request-promise');

const app = new Express();

// register fonts and datasource plugins
mapnik.register_default_fonts();
mapnik.register_default_input_plugins();

/**
 * If WMS_URL is defined, fetch the specified background image.
 * If not, return an empty image
 */
function getWmsImage(wms, width, height, extent) {
  if (wms.url) {
    const bbox = extent.join(',');
    return request(`${wms.url}/GetMap`, {
      qs: {
        bbox: bbox,
        format: 'image/jpeg',
        height: height,
        layers: wms.layers,
        request: 'GetMap',
        'srs(crs)': wms.srs,
        styles: wms.styles,
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
  const wms = {
    url: req.query.wmsUrl,
    layers: req.query.wmsLayers,
    styles: req.query.wmsStyles,
    srs: req.query.wmsSrs,
  };

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
    wms: getWmsImage(wms, width, height, map.extent),
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
