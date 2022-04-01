const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const path = require('path');
const oauthSign = require('oauth-sign');
const oauth2 = require('@jhveem/oauth2');
const LTIUser = oauth2.LTIUserSchema;
const canvas = require('./libs/canvas.js');
const axios = require('axios');
const ltidata = require('./lti-data.js');

const CLIENT_SECRET = ltidata.client_secret;
const CLIENT_ID = ltidata.client_id;
const lti_name = ltidata.lti_name;
const LTI_URL_BASE = ltidata.lti_url_base;

//this is the post request made when an lti is first launched. 

router.post('/init', async (req, res) => {
  let canvasUserId = req.body.custom_canvas_user_id;
  let courseId = req.body.custom_course_id;

  let sessionData = {
    courseId: courseId,
    canvSubId: req.body.lis_result_sourcedid,
    canvSubUrl: req.body.lis_outcome_service_url
  };
  try {
    let users = await LTIUser.find({
      lti: lti_name,
      canvasUserId: canvasUserId 
    }).exec();
    let requestAuth = false;
    if (users.length === 0) {
      requestAuth = true; 
    } else {
      if (users[0].refreshToken == '') requestAuth = true;
    }
    if (requestAuth) {
      let newUserData = {
        lti: lti_name,
        canvasUserId: canvasUserId,
        code: '',
        accessToken: '',
        refreshToken: '',
        sessionData: sessionData
      };
      let user = new LTIUser(newUserData);
      await user.save();
      let redirectUri = LTI_URL_BASE + '/oauth2/redirect';
      let redirectUrl = oauth2.genCanvasRequestAuthUrl(CLIENT_ID, redirectUri, sessionData)
      res.redirect(redirectUrl);
    } else {
      //it already exists, hop straight to the site
      let ltiUser = users[0];
      ltiUser.sessionData = sessionData;
      await ltiUser.save();
      let redirectUri = LTI_URL_BASE + '/oauth2/redirect';
      oauth2.getAccessToken(lti_name, CLIENT_ID, CLIENT_SECRET, ltiUser.canvasUserId, redirectUri);
      res.redirect(LTI_URL_BASE + '/index.html?canvas_user_id=' + ltiUser.canvasUserId + '&course_id=' + ltiUser.sessionData.courseId);
    }
  } catch(err) {
    console.log(err);
  }
});

async function canvasGet(url, accessToken, resData=[]) {
  let nextPage = "";
  await axios.get(url + '&per_page=100&access_token=' + accessToken).then((res) => {
    let linkString = res.headers.link;
    resData = resData.concat(res.data);
    if (linkString !== undefined) {
      let links = linkString.split(',');
      for (let l = 0; l < links.length; l++) {
        let link = links[l];
        let regex = /<([^>]*)>; rel="(.*?)"/;
        let linkPieces = link.match(regex);
        let rel = linkPieces[2];
        if (rel === 'next') {
          nextPage = linkPieces[1];
          console.log(nextPage);
        }
      }
    }
  });
  if (nextPage !== "") {
     return await canvasGet(nextPage, accessToken, resData);
  }
  return resData;
}

router.post('/api/canvas', async (req, res) => {
  let body = req.body;
  let redirectUri = LTI_URL_BASE + '/oauth2/redirect';
  let accessToken = await oauth2.getAccessToken(lti_name, CLIENT_ID, CLIENT_SECRET, body.user, redirectUri);
  let data = body.data;
  canvas
  switch(body.type) {
    case 'GET':
      try {
        console.log(body.url);
        console.log(accessToken);
        let data = await canvasGet(body.url + '?' + body.urlParams, accessToken);
        res.send(data);
      } catch(err) {
        console.log(err);
        res.sendStatus(400);
      }
      break;
    case 'PUT':
      try {
        if (body.urlParams != "") {
          body.urlParams += "&";
        }
        let url = body.url + '?' + body.urlParams + 'access_token=' + accessToken;
        let response = await axios.put(url, body.data);
        let data = response.data;
        res.send(data);
      } catch(err) {
        //console.log(err);
        console.log("PUT REQUEST FAILED");
        res.sendStatus(400);
      }
      break;
    case 'POST':
      try {
        if (body.urlParams !== "") boy.urlparams += "&";
        let url = body.url + '?' + body.urlParams + 'access_token=' + accessToken;
        let response = await axios.post(url, body.data);
        let data = response.data;
        res.send(data);
      } catch(err) {
        //console.log(err);
        console.log("POST REQUEST FAILED");
        res.sendStatus(400);
      }
      break;
  }
});

router.get('/oauth2/redirect', async (req, res) => {
  //the code is a code sent by canvas used to authenticate the user
  let code = req.query.code;
  try {
    //Post to Canvas, if all is well, a token and refresh token will be returned
    let redirectUri = LTI_URL_BASE + '/oauth2/redirect';
    let userData = await oauth2.genUserData(lti_name, CLIENT_ID, CLIENT_SECRET, code, redirectUri);
    let ltiUsers = await LTIUser.find({
      lti: lti_name,
      canvasUserId: userData.canvasUserId
    }).exec();
    let ltiUser = ltiUsers[0];
    ltiUser.accessToken = userData.accessToken;
    ltiUser.refreshToken = userData.refreshToken;
    ltiUser.canvasUserId = userData.canvasUserId;
    ltiUser.lastRefresh = new Date();
    
    await ltiUser.save();
    res.redirect(LTI_URL_BASE + '/index.html?canvas_user_id=' + ltiUser.canvasUserId + '&course_id=' + ltiUser.sessionData.courseId);
  } catch(err) {
    console.log(err);
    //if something doesn't work, log all the variables sued and then the error
    console.log(lti_name + ': error performing oauth2 authentication');
  }
});


//index page
router.post('/', (req, res) => {
  console.log("INDEX INIT");
  let oauth_url = LTI_URL_BASE + req.originalUrl;
  let parameters = {};
  for (let key in req.body) {
    if (key.toString() != "oauth_signature") {
      parameters[key] = req.body[key];
    }
  }

  const sig = oauthSign.hmacsign("POST", oauth_url, parameters, 'btech');
  //need to verify sig and time here
  if (sig === req.body.oauth_signature) {
    let role = req.body.roles.replace('urn:lti:instrole:ims/lis/', '');
    let url = './public/index.html';
    let filePath = path.resolve(__dirname, url);
    res.sendFile(filePath);
  }
});

module.exports = {
  routes: router
};

