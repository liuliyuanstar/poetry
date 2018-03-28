var express = require('express');
var router = express.Router();
var basic = require('../base/basic');

// 获取诗文list
router.post('/getPoetryList', function(req, res, next) {
  const pageNo = req.query.pageNo;
  const pageSize = req.query.pageSize;
  basic.getPoetryList(pageNo, pageSize).then((data) => {
    res.send(data);
  }).catch(function (error) {
    res.send(error);
  });
});

//获取分类
router.post('/getClassfiy', function(req, res, next) {
  const tab = req.query.tab;
  const title = req.query.title;
  basic.getClassify(tab, title).then((data) => {
    res.send(data);
  }).catch(function (error) {
    res.send(error);
  });

});
module.exports = router;
