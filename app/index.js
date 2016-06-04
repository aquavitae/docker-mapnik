const Express = require('express')
const mapnik = require('mapnik');
const bodyParser = require('body-parser');

const app = new Express();

// register fonts and datasource plugins
mapnik.register_default_fonts();
mapnik.register_default_input_plugins();

app.get('/health', (req, res) => {
  res.send('ok!');
});

app.post('/render', bodyParser.text({ type: 'text/xml' }), (req, res) => {
  const map = new mapnik.Map(256, 256);
  const template = req.body;
  map.fromStringSync(template);
  map.zoomAll();
  const image = new mapnik.Image(256, 256);
  map.render(image, (err, image) => {
    if (err) {
      throw err;
    }

    image.encode('png', (err, buffer) => {
      if (err) {
        throw err;
      }
      res.set('Content-Type', 'image/png');
      res.send(buffer);
    });
  });
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
