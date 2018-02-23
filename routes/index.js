var express = require('express');
var router = express.Router();
var spider = require('../base/spider');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: '456' });
});

// 获取分类
router.get('/classify', function(req, res, next) {
  spider.classify().then((data) => {
    res.send(data);
  });
});
// 获取古诗
router.get('/poetry', function(req, res, next) {
  spider.getPoetry().then((data) => {
    res.send(data);
  });
});
// 获取失败的古诗
router.get('/repoetry', function(req, res, next) {
  spider.reGetPoetry().then((data) => {
    res.send(data);
  });
});
// 获取古籍
router.get('/book', function(req, res, next) {
  spider.getAncientBooks().then((data) => {
    res.send(data);
  });
});
module.exports = router;
