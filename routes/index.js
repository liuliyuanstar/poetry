var express = require('express');
var router = express.Router();
var spider = require('../base/spider');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: '456' });
});

// 接口们
router.get('/poetry', function(req, res, next) {
  let result = spider.onRequest();
  console.log(result);
  res.send(result);
});

module.exports = router;
