//server
const express = require('express');
const bodyParser = require('body-parser');
const PORT = 3014;

//set up the app
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: false
}));

app.use((req, res, next) => {
  next();
});

app.use(express.static('public'));

const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/course-track', {
	useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected");
}).catch(err => {
  console.log(err);
});
//disable flags
/*
const apiFlags = require("./api/flags.js");
app.use(apiFlags.routes);

const apiFlagSettings = require("./api/flag_settings.js");
app.use(apiFlagSettings.routes);
const courses = require("./api/courses.js");
app.use(courses.routes);

const users = require("./api/users.js");
app.use(users.routes);

const init = require("./init.js");
app.use(init.routes);
*/

app.listen(PORT, () => console.log(`Server listening on port ${PORT}!`));
