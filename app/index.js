const Express = require('express')
const mapnik = require('mapnik');
const bodyParser = require('body-parser');
const morgan = require('morgan')

const app = new Express();

// If defined, use WMS_URL to get a background image
const wmsUrl = process.env.WMS_URL;
const wmsLayers = provess.wnv.WMS_LAYERS;
const wmsStyles = provess.wnv.WMS_STYLES;

// register fonts and datasource plugins
mapnik.register_default_fonts();
mapnik.register_default_input_plugins();

function getWmsImage(map) {
  const bbox = map.extend.join(',');
  return request(`${wmsUrl}/GetMap`, {
    qs: {
      bbox: bbox,
      format: 'image/png',
      height: map.height,
      layers: wmsLayers,
      request: 'GetMap',
      'srs(crs)': map.srs,
      styles: wmsStyles,
      version: 1.1,
      width: map.width,
    },
  }).then(res => mapnik.Image.fromBufferSync(res.body));
}

// Configure request logging
app.use(morgan('combined'));

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
    wms: getWmsImage(map)
    layers: Promise.promisify(map.render)(image),
  }).then(x => {
    const image = x.wms.composite(x.layers);
    return Promise.promisify(image.encode)('png');
  }).then(
    resolve(buffer);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  }).catch(err => {
    throw err
  });
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
