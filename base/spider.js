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
    poetryFailList: [],
    yzsFailList: [],
    bookFailList: [],
    chapterFailList: [],
    poetryUrls: {
        baseUrl: 'http://www.gushiwen.org/shiwen/',
        mark: 'default_0A0A',
        totalPages: 0,
        totalNum: 0,
        numPerPage: 10
    },
    ancientBooks: {
        basicUrl: 'http://so.gushiwen.org/guwen/',
        mark: 'book_',
        totalNum: 0
    },
    setClassifyUrl: function() {
        this.pageUrls.push('http://www.gushiwen.org');
        this.pageUrls.push('http://www.gushiwen.org/shiwen/');
        this.pageUrls.push('http://so.gushiwen.org/mingju/');
        this.pageUrls.push('http://so.gushiwen.org/authors/');
        this.pageUrls.push('http://so.gushiwen.org/guwen/');
    },
    // 抓取分类
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
    // 抓取诗文
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
                // this.poetryUrls.totalPages = Math.floor(totalNum / 10) + 1;
                this.poetryUrls.totalPages = totalNum;
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
    // 诗文：从未抓取到的链接中重新抓取
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
    // 抓取诗文页面并控制并发量
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
    // 抓取诗文页面并分析
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
    // 抓取诗文翻译注释赏析
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
    // 存储诗文相关信息
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
    },
    // 抓取古籍
    getAncientBooks: function () {
        return new Promise((resolve, reject) => {
            superagent.get(this.ancientBooks.basicUrl).end((err, data) => {
                if (err) {
                    reject(err);
                }
                let $ = cheerio.load(data.text);
                let totalNum = $($('.main3 .pages>span')[1]).text();
                totalNum = parseInt(totalNum.slice(1, totalNum.length-1));
                this.ancientBooks.totalNum = totalNum;
                let urls = [];
                for (let i = 194; i < totalNum; i++) {
                    let url = this.ancientBooks.basicUrl + this.ancientBooks.mark + (i + 1) + ".aspx";
                    urls.push(url);
                }
                console.log("共 " + totalNum + "本");
                this.limitGetBooks(urls, resolve);
            });
        });
    },
    // 获取取古籍内容
    getBooksDetail: function (url, callback) {
        superagent.get(url).end((err, data) => {
            if (err || !data.text) {
                this.bookFailList.push({bookId: url, chapter: 'all'});
                return;
            }
            let $ = cheerio.load(data.text);
            let bookId = $($('.main3 .left textarea')[0]).attr('id').slice(12);
            let introduce = $($('.main3 .sonspic .cont>p')[0]).text();
            let title = $($('.main3 .sonspic .cont b')[0]).text();
            let chapterList = [];
            let chapterLables = $('.main3 .left .sons ul>span>a');
            if (chapterLables.length == 0) {
                chapterLables = $('.main3 .left .sons .bookcont');
                for (let m = 0; m < chapterLables.length; m++) {
                    let lables = $($(chapterLables[m]).find('div')[1]).find('span>a');
                    for (let n = 0; n < lables.length; n++) {
                        let lable = lables[n];
                        let urlInfo = {};
                        if ($(lable).attr("href")) {
                            let url = 'http://so.gushiwen.org' + $(lable).attr("href");
                            urlInfo.url = url;
                            urlInfo.part = $(chapterLables[m]).find('div>strong').text();
                            urlInfo.bookId = bookId;
                            chapterList.push(urlInfo);
                        }
                    }
                }
            } else {
                for (let i = 0; i < chapterLables.length; i++) {
                    let urlInfo = {};
                    let lable = chapterLables[i];
                    if ($(lable).attr("href")) {
                        let url = 'http://so.gushiwen.org' + $(lable).attr("href");
                        urlInfo.url = url;
                        urlInfo.part = 'none';
                        urlInfo.bookId = bookId;
                        chapterList.push(urlInfo);
                    }
                }
            }
            let book = {
                bookId: bookId,
                introduce: introduce,
                title: title,
                chapter: []
            };
            MongoDB.save('book', book, () => {
                this.limitGetChapter(chapterList, callback);
            });
        });
    },
    // 抓取古籍内容
    limitGetBooks: function(urls, resolve) {
        this.chapterFailList = [];
        async.mapLimit (urls, 2, (url, callback) => {
            this.getBooksDetail(url, callback);
        }, (err, results) => {
            if (err) {
                console.log(err);
            }
            if (results.length == urls.length) {
                // if (this.chapterFailList.length > 0) {
                //     for (let i = 0; i < this.chapterFailList.length; i++) {
                //         let info = this.chapterFailList[i];
                //         MongoDB.save('fail_yzs', info);
                //     }
                //     console.log('chapterFailList:' + this.chapterFailList.length);
                // }
                // if (isRe) {
                //     let res = {
                //         errorCode: 0,
                //         errorMessage: '古籍再次抓取完毕！'
                //     };
                //     funCallBack(res);
                // } else {
                //     funCallBack(null, infoArr.length + ' yizhushang call back!');
                // }
                console.log('book success!');
            } else {
                for (let j = 0; j < this.bookFailList.length; j++) {
                    let failChapter = this.bookFailList[j];
                    MongoDB.save('fail_chapter', failChapter);
                }
                console.log("falied book " + this.bookFailList.length);
            }
            let res = {
                errorCode: 0,
                errorMessage: '抓取完毕！',
                failed: this.bookFailList.length
            };
            resolve(res);
        });
    },
    // 抓取章节内容
    limitGetChapter: function (urlInfos, funCallBack) {
        async.mapLimit (urlInfos, 10, (urlInfo, callBack) => {
            this.getChapterDetail(urlInfo, callBack);
        }, (err, results) => {
            if (results.length == urlInfos.length) {
                console.log("book: " + urlInfos[0].bookId + " done!");
            } else {
                for (let i = 0; i < this.chapterFailList.length; i++) {
                    let chapter = this.chapterFailList[i];
                    MongoDB.save('fail_chapter', chapter);
                }
                console.log("fail_chapter: " + this.chapterFailList.length);
            }
            funCallBack(null, urlInfos[0].bookId);
        });
    },
    // 获取古籍章节内容
    getChapterDetail: function (urlInfo, callBack) {
        superagent.get(urlInfo.url).end((err, data) => {
            if (err || !data.text) {
                this.chapterFailList.push({bookId: urlInfo.bookId, url: url});
                return;
            }
            let $ = cheerio.load(data.text);
            let chapterId = $($('.main3 .left .cont h1 span')[1]).attr('id').slice(9);
            let title = $($('.main3 .left .cont h1 span')[0]).find('b').text();
            let author = $($('.main3 .left .cont .source a')[0]).text();
            let contentLable = $('.main3 .left .cont .contson');
            let content = contentLable.text();
            let chapter = {
                chapterId: chapterId,
                title: title,
                author: author,
                content: content,
                part: urlInfo.part
            };
            if ($($('.main3 .left .cont h1 a')[1]).attr('id')) {
                let yizhuId = $($('.main3 .left .cont h1 a')[1]).attr('id').slice(7);
                let yiZhuUrl = 'http://so.gushiwen.org/guwen/ajaxbfanyi.aspx?id=' + yizhuId;
                superagent.get(yiZhuUrl).end((err, subData) => {
                    if (err || !data.text) {
                        this.chapterFailList.push({bookId: urlInfo.bookId, url: url});
                        return;
                    }
                    let translate = "";
                    let annotation = "";
                    let $ = cheerio.load(subData.text);
                    let con = $('.shisoncont').text();
                    let start = con.lastIndexOf('译文') > con.lastIndexOf('全屏') ? con.lastIndexOf('译文') : con.lastIndexOf('全屏');
                    let end = con.lastIndexOf('注释') == con.lastIndexOf('注释：') ? -1 : con.lastIndexOf('注释');
                    if (end > 0) {
                        translate = con.slice(start + 4, end);
                        annotation = con.slice(end + 2);
                    } else {
                        translate = con.slice(start + 4);
                    }
                    chapter.translate = translate;
                    chapter.annotation = annotation;
                    MongoDB.updateData('book',{bookId: urlInfo.bookId}, {$push:{"chapter": chapter}}, () => {
                        callBack(null, chapter);
                    });
                })
            } else {
                MongoDB.updateData('book',{bookId: urlInfo.bookId}, {$push:{"chapter": chapter}}, () => {
                    callBack(null, chapter);
                });
            }
        });
    }
};
module.exports = spider;

