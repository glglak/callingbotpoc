const express = require('express');
const bodyParser = require('body-parser');
const callController = require('./controllers/callController');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use('/api/calls', callController);

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
