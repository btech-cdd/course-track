//server
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const bodyParser = require('body-parser');
let limits = 10 * 1024 * 1024 * 1024;
const busboy = require('connect-busboy');
const axios = require('axios');
const uuid = require('uuid');

//set up the app
const app = express();
const CANVAS_ACCESS_TOKEN = "14~HUaGAV9wYAESQaxGDumjzOjjoFZAlfLbMRV1750cZijHt6uDSRIi6iLudiJHTd1c" ;
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true, parameterLimit: 1000000}));


sessionConfig = {
  secret: 'btech',
  name: 'btech-lti',
  resave: true,
  saveUninitialized: true,
  cookie: {
    sameSite: 'none',
    secure: true,
  }
}

app.use(session(sessionConfig));
app.use(cookieParser());

async function genAuthCode(canvasId) {
  let expiration = new Date();
  expiration.setHours(expiration.getHours() + 1);
  let auth_code = uuid.v4();
  let url = "https://btech.instructure.com/api/v1/users/" + canvasId + "/custom_data/btech-reports?ns=dev.bridgetools.reports&data[auth_code]=" + auth_code + "&data[expiration]=" + expiration + "&access_token=" + CANVAS_ACCESS_TOKEN;
  try {
    await axios.put(url);
  } catch(e) {
    try {
      await axios.post(url);
    } catch (e) {
      console.log("Failed to add auth token");
    }
  }
  return auth_code;
}

async function getAuthData(canvasId) {
  let reqUrl = "https://btech.instructure.com/api/v1/users/" + canvasId + "/custom_data/btech-reports?ns=dev.bridgetools.reports&access_token=" + CANVAS_ACCESS_TOKEN;
  let authData = await axios.get(reqUrl);
  authData = authData.data.data;
  return authData;
}


app.put("/gen_uuid", async function(req, res) {
  let query = req.query;
  let requester_id = query.requester_id;
  await genAuthCode(requester_id);
  res.sendStatus(200);
});

app.use("/api", async function(req, res, next) {
  let query = req.query;
  let override_key = query.override_key;
  //a temporary override to let me update the database from the remote desktop
  if (override_key == 'jhveem1234!') {
    next()
    return
  }

  let origin = req.get('origin');
  if (origin === undefined) origin = "reports.bridgetools.dev";

  //for all cross origin requests
  if (origin.includes("reports.bridgetools.dev")) {
    //if same site?
    let requester_id = req.cookies.currentUser; 
    //let authCode = await getAuthData(requester_id); 
    if (requester_id != undefined) {
      //VERY LAZY SECURITY HERE. REVISIT
      next();
      return
    } else {
      res.sendStatus(401);
    }
  } else { //dont check for cookie, check for auth code
    let query = req.query;
    let requester_id = query.requester_id;
    let auth_code = query.auth_code;
    try {
      //got the request, now generate a new code for the next one
      let authData = await getAuthData(requester_id);
      await genAuthCode(requester_id);
      if (auth_code === authData.auth_code) {
        next();
        return;
      } else {
        res.sendStatus(401);
        return;
      }
    } catch(e) {
      //assumes error is because key doesn't exist, so creates a new one and sends s rejections status
      await genAuthCode(requester_id);
      res.sendStatus(401);
      return;
    }
  }
});

app.use(bodyParser.urlencoded({
  extended: true 
}));

app.use(busboy({
  highWaterMark: limits,
}));



app.use(express.static('public'));

const mongoose = require('mongoose');
mongoose.set('useCreateIndex', true);
mongoose.connect('mongodb://localhost:27017/reports', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected");
}).catch(err => {
  console.log(err);
});


const init = require("./init.js");
app.use(init.routes);

//const users = require("./users.js");
//app.use(users.routes);

const data = require("./data.js");
app.use(data.routes);

const apiStudents = require("./api/students.js");
app.use(apiStudents.routes);

const apiTrees = require("./api/trees.js");
app.use(apiTrees.routes);

const apiHours = require("./api/hours.js");
app.use(apiHours.routes);

const apiInstructors = require("./api/instructors.js");
app.use(apiInstructors.routes);

const apiSettings = require("./api/settings.js");
app.use(apiSettings.routes);

const surveys = require("./surveys/survey_data.js");
app.use(surveys.routes);

app.listen(3014, () => console.log('Server listening on port 3014!'));
