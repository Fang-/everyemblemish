const fs = require('fs');
const http = require('http');

const Twit = require('twit');
const Twitter = new Twit(require('./config.js'));

const ob = require('urbit-ob');

const RNG = require('rng-js');

const sharp = require('sharp');

const STATE_FILE = 'posted.json';
const SIGIL_SIZE = 1024;
const POST_MSECS = 6 * 60 * 60 * 1000;

let posted = {};

//  loadState: load or initialize state
//
const loadState = async function() {
  if (fs.existsSync(STATE_FILE)) {
    console.log('Loading state from disk...');
    posted = JSON.parse(fs.readFileSync(STATE_FILE));
  }

  return;
};

//  saveState: write state to file
//
const saveState = function() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(posted));
}

const loadData = function(p) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '159.65.204.48',
      port: 8081,
      path: '/emblemish/'+p+'.json',
      method: 'GET'
    };

    const req = http.request(opts, res => {
      if (res.statusCode !== 200) {
        reject('unexpected status ' + res.statusCode);
      }

      let dat = '';
      res.on('data', d => {
        dat = dat + d;
      });
      res.on('end', () => {
        let res = JSON.parse(dat);
        if (!res.emblem) reject('response no emblem');
        if (!res.title)  reject('response no title');
        resolve(res);
      });
    });

    req.on('error', error => {
      reject(error);
    });
    req.end();
  });
}

const renderPng = function(s) {
  //NOTE  dumb lib can't scale svgs cleanly
  s = s.replace(/<svg.*><defs>/, '<svg version="1.1" width="1024" height="1024" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>');
  return sharp(Buffer.from(s, 'utf8'))
    .resize(Math.floor(SIGIL_SIZE/9*16), SIGIL_SIZE, { fit: 'contain', background: 'white' })
    .png().toBuffer();
}

const pickP = function(s) {
  let rng = new RNG(s);
  let p;
  do {
    p = rng.random(0, 0xffffffff+1);
  } while (!!posted[p]);
  return p;
}

const logP = function(p, t) {
  console.log('posted', ob.patp(p), t);
  posted[p] = true;
  saveState();
}

const uploadPng = async function(png) {
  const res = await Twitter.post('media/upload', { media_data: Buffer.from(png).toString('base64') });
  if (res.err) throw res.err;
  if (!res.data.media_id_string) throw 'no media id';
  return res.data.media_id_string;
}

const sendTweet = async function(t, mediaId) {
  const params = { status: t, media_ids: [mediaId] }
  const res = await Twitter.post('statuses/update', params);
  if (res.err) throw res.err;
  return;
}

const runNext = function() {
  let n = (new Date()).getTime();
  let s = Math.floor(n / POST_MSECS);
  setTimeout(run, (POST_MSECS - n % POST_MSECS));
}

const run = async function() {
  let n = (new Date()).getTime();
  let s = Math.floor(n / POST_MSECS);
  setTimeout(run, (POST_MSECS - n % POST_MSECS));
  try {
    let p = pickP(s);
    const dat = await loadData(p);
    const png = await renderPng(dat.emblem);
    const imgId = await uploadPng(png);
    await sendTweet(dat.title, imgId);
    logP(p, dat.title);
  } catch (e) {
    console.error('failed to post:', e);
  }
  return;
}

loadState().then(runNext);
