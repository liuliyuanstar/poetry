let http = require("http");
let url = require("url");
let superagent = require("superagent");
let cheerio = require("cheerio");
let async = require("async");
let eventproxy = require('eventproxy');
let MongoDB = require('./../dataBase/dbHelper');
spider = {
    ep: new eventproxy(),
    pageUrls: [],
    poetryFailList: 0,
    yzsFailList: 0,
    poetryUrls: {
        baseUrl: 'http://www.gushiwen.org/shiwen/',
        mark: 'default_0A0A',
        totalPages: 0,
        totalNum: 0,
        numPerPage: 10
    },
    setClassifyUrl: function() {
        this.pageUrls.push('http://www.gushiwen.org');
        this.pageUrls.push('http://www.gushiwen.org/shiwen/');
        this.pageUrls.push('http://so.gushiwen.org/mingju/');
        this.pageUrls.push('http://so.gushiwen.org/authors/');
        this.pageUrls.push('http://so.gushiwen.org/guwen/');
    },
    getClassify: function() {
        return new Promise((resolve, reject) => {
            this.setClassifyUrl();
            let proArr = [];
            for (let i = 0; i < this.pageUrls.length; i++) {
                let pageUrl = this.pageUrls[i];
                let tab = '';
                let urlPromise = new Promise((resolve, reject) => {
                    superagent.get(pageUrl).end(function (err, pres) {
                        if (err) {
                            reject(err);
                        }
                        // pres.text 里面存储着请求返回的 html 内容，将它传给 cheerio.load 之后
                        // 就可以得到一个实现了 jquery 接口的变量，我们习惯性地将它命名为 `$`
                        let $ = cheerio.load(pres.text);
                        let tabs = $('.main1 .son1>a');
                        tab = $(tabs[i]).text();
                        let classifys = $('.main3 .titletype>.son2');
                        for (let m = 0; m < classifys.length; m++) {
                            let title = '';
                            let type = classifys[m];
                            if ($(type).find('.sleft>span').text()) {
                                title = $(type).find('.sleft>span').text();
                            } else {
                                title = $(type).find('.sleft>a').text();
                            }
                            let hrefBoxes = $(type).find('.sright>a');
                            for(let n = 0; n < hrefBoxes.length; n++) {
                                let hrefInfo = {};
                                hrefInfo.text = $(hrefBoxes[n]).text();
                                hrefInfo.href = $(hrefBoxes[n]).attr('href');
                                hrefInfo.title = title;
                                hrefInfo.tab = tab;
                                MongoDB.save('classify', hrefInfo, function (err, res) {
                                    // console.log(res);
                                });
                            }
                        }
                        resolve();
                    });
                });
                proArr.push(urlPromise);
            }
            Promise.race(proArr).then(function() {
                resolve({errorCode: 0, errorMessage: 'success'});
            }, function(reason) {
                reject(reason);
            });
        });
    },
    getPoetry: function() {
        return new Promise((resolve, reject) => {
            superagent.get(this.poetryUrls.baseUrl).end((err, data) => {
                if (err) {
                    reject(err);
                }
                let $ = cheerio.load(data.text);
                let totalNum = $($('.main3 .pages>span')[1]).text();
                totalNum = parseInt(totalNum.slice(1, totalNum.length-2));
                this.poetryUrls.totalNum = totalNum;
                this.poetryUrls.totalPages = Math.floor(totalNum / 10) + 1;
                // this.poetryUrls.totalPages = 10;
                let urls = [];
                for (let i = 0; i < this.poetryUrls.totalPages; i++) {
                    let url = this.poetryUrls.baseUrl + this.poetryUrls.mark + (i + 1) + ".aspx";
                    urls.push(url);
                }
                MongoDB.remove('fail_yzs', {}); // 删除链接表
                this.limitGetPage(urls, resolve);
            });
        });
    },
    limitGetPage: function(urls, resolve) {
        this.poetryFailList = [];
        async.mapLimit (urls, 1, (url, callback) => {
            this.getPoetryMain(url, callback);
        }, (err, result) => {
            if (result.length == urls.length) {
                if (this.poetryFailList.length > 0) {
                    MongoDB.remove('fail_poetry', {}, () => {
                        for (let i = 0; i < this.poetryFailList.length; i++) {
                            let url = this.poetryFailList[i];
                            MongoDB.save('fail_poetry', url);
                        }
                    });
                    console.log('poetryFailList:' + this.poetryFailList.length);
                }
                let res = {
                    errorCode: 0,
                    errorMessage: '抓取完毕！'
                };
                resolve(res);
            }
        });
    },
    getPoetryMain: function(url, callback) {
        superagent.get(url).end((err, data) => {
            if (err || !data.text) {
                this.poetryFailList.push(url);
                return;
            }
            let $ = cheerio.load(data.text);
            let ids = $('.main3 .left textarea');
            let sons = $('.main3 .left .sons');
            let infoArr = [];
            for (let j = 0; j < ids.length; j++) {
                let id = $(ids[j]).attr('id').slice(6);
                let title = $(sons[j]).find('.cont p b').text();
                let times = $($(sons[j]).find('.cont .source a')[0]).text();
                let author = $($(sons[j]).find('.cont .source a')[1]).text();
                let showUrl = 'http://so.gushiwen.org/shiwen2017/ajaxshiwencont.aspx?id=' + id + '&value=yizhushang';
                infoArr.push({id: id, title: title, times: times, author: author, url: showUrl});
            }
            this.limitGetYzs(infoArr, callback);
        });
    },
    reGetPoetry: function () {
        return new Promise((resolve, reject) => {
            MongoDB.find('fail_yzs',{},(err, infoArr) => {
                if (err) {
                    reject(err);
                }
                this.limitGetYzs(infoArr, resolve, true);
            });
        });
    },
    limitGetYzs: function(infoArr, funCallBack, isRe) {
        this.yzsFailList = [];
        async.mapLimit (infoArr, 10, (info, callback) => {
            this.showYiZhuShang(info, callback);
        }, (err, results) => {
            if (err) {
                console.log(err);
            }
            if (results.length == infoArr.length) {
                if (this.yzsFailList.length > 0) {
                    for (let i = 0; i < this.yzsFailList.length; i++) {
                        let info = this.yzsFailList[i];
                        MongoDB.save('fail_yzs', info);
                    }
                    console.log('yzsFailList:' + this.yzsFailList.length);
                }
                if (isRe) {
                    let res = {
                        errorCode: 0,
                        errorMessage: '再次抓取完毕！'
                    };
                    funCallBack(res);
                } else {
                    funCallBack(null, infoArr.length + ' yizhushang call back!');
                }
            }
        });
    },
    showYiZhuShang: function(info, callback) {
        superagent.get(info.url).end((err, data) => {
            let poetry = {};
            poetry.poetryId = info.id;
            poetry.title = info.title;
            poetry.times = info.times;
            poetry.author = info.author;
            poetry.appreciation = [];
            poetry.content = [];
            if (err || !data.text) {
                this.yzsFailList.push(info);
            } else {
                let $ = cheerio.load(data.text);
                let paragraphs = $('p');
                for (let i = 0; i < paragraphs.length - 1; i++) {
                    let p = $(paragraphs[i]);
                    let content = {};
                    if (p.find('span').length >= 1) {
                        let pClone = p.clone();
                        pClone.find('span').remove();
                        content.original = pClone.text();
                        content.translate = $(p.find('span')[0]).text();
                        if (p.find('span')[1]) {
                            content.annotation = $(p.find('span')[1]).text();
                        }
                        poetry.content.push(content);
                    } else {
                        let pClone = p.clone();
                        pClone.find('*').remove();
                        poetry.appreciation.push(p.text());
                    }
                }
                MongoDB.save('poetry', poetry, () => {
                    if (info._id) {
                        console.log("success:" + info.title);
                        MongoDB.remove('fail_yzs', {_id: info._id})
                    }
                });
            }
            callback(null, 'detail');
        });
    }
};
module.exports = spider;

