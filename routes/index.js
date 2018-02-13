var express = require('express');
var router = express.Router();
var spider = require('../base/spider');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: '456' });
});

// 接口们
router.get('/classify', function(req, res, next) {
  spider.classify().then((data) => {
    res.send(data);
  });
});
router.get('/poetry', function(req, res, next) {
  spider.getPoetry().then((data) => {
    res.send(data);
  });
});
router.get('/repoetry', function(req, res, next) {
  spider.reGetPoetry().then((data) => {
    res.send(data);
  });
});

module.exports = router;
