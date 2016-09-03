const Express = require('express')
const mapnik = require('mapnik');
const bodyParser = require('body-parser');
const morgan = require('morgan')
const Promise = require('bluebird');
const request = require('request-promise');

const app = new Express();

// register fonts and datasource plugins
mapnik.register_system_fonts();
mapnik.register_default_input_plugins();

function zoomBbox(bbox, factor) {
  const currentXDistance = (bbox[2] - bbox[0]);
  const currentYDistance = (bbox[3] - bbox[1]);
  const newXDistance = currentXDistance * factor;
  const newYDistance = currentYDistance * factor;
  const xChange = newXDistance - currentXDistance;
  const yChange = newYDistance - currentYDistance;

  const lowX = bbox[0] - (xChange / 2);
  const lowY = bbox[1] - (yChange / 2);
  const highX = (xChange / 2) + bbox[2];
  const highY = (yChange / 2) + bbox[3];

  const sized = [lowX, lowY, highX, highY];
  return sized;
};

/**
 * If WMS_URL is defined, fetch the specified background image.
 * If not, return an empty image
 */
function getWmsImage(wms, width, height, extent) {
  if (wms.url) {
    const bbox = extent.join(',');
    const qs = {
      bbox: bbox,
      format: 'image/png',
      height: height,
      layers: wms.layers,
      request: 'GetMap',
      srs: wms.srs,
      styles: wms.styles,
      version: 1.1,
      width: width,
    };
    console.log(`WMS request: ${wms.url}/GetMap`);
    console.log(qs);
    return request(`${wms.url}/GetMap`, {
      qs,
      timeout: 60000,
      encoding: null
    })
    .catch(error => {
      console.error('Upstream error')
      console.error(error);
      return Promise.reject({
        status: 502,
        message: 'Problem with WMS',
        error,
      });
    })
    .then(res => {
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

app.post('/render', bodyParser.text({
  type: 'text/xml',
  limit: '10mb',
}), (req, res) => {
  const wms = {
    url: req.query.wmsUrl,
    layers: req.query.wmsLayers,
    styles: req.query.wmsStyles,
    srs: req.query.wmsSrs,
  };

  const zoomFactor = req.query.zoomFactor || 1.2;

  // Get width and height from query parameters
  const width = parseFloat(req.query.width) || 200;
  const height = parseFloat(req.query.height) || 200;

  // Load the template from the request body and create a map
  const template = req.body;
  const map = new mapnik.Map(width, height);
  map.fromStringSync(template);
  map.zoomAll();

  // Zoom out 20 by a factor
  map.zoomToBox(zoomBbox(map.extent, zoomFactor));

  // Create a new image using the map
  const image = new mapnik.Image(width, height);
  Promise
    .props({
      wms: getWmsImage(wms, width, height, map.extent),
      layers: Promise.promisify(map.render, { context: map })(image),
    })
    .then(x => {
      // Make sure the images are premultiplied
      if (!x.wms.premultiplied()) {
        x.wms.premultiplySync();
      }
      if (!x.layers.premultiplied()) {
        x.layers.premultiplySync();
      }
      return x;
    })
    .then(x => Promise.promisify(x.wms.composite, { context: x.wms })(x.layers))
    .then(image => Promise.promisify(image.encode, { context: image })('png'))
    .then(buffer => {
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    }).catch(err => {
      const status = err.status || 500;
      res.status(status).json(err);
    });
});

app.get('*', (req, res) => {
  const html = `
    <h1>Render map</h1>
    <p><code>POST</code> to <code>\\render</code> with the following
    querystring parameters:
    <dl>
      <dt>height</dt><dd>Height of the generated image in pixels (default 200)</dd>
      <dt>width</dt><dd>Width of the generated image in pixels (default 200)</dd>
      <dt>wmsUrl</dt><dd>URL to a WMS service from which to obtain a background image</dd>
      <dt>wmsLayers</dt><dd>Layer in the WMS</dd>
      <dt>wmsStyles</dt><dd>Style in the WMS</dd>
      <dt>wmsSrs</dt><dd>SRS of the WMS. This should match the SRS of the data posted</dd>
    </dl>
    The body of the post should be an XML document (type <code>text\\xml</code>)
    representing the mapnik stylesheet.
  `;
  res.send(html);
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
