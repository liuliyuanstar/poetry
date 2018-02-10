let http = require("http");
let url = require("url");
let superagent = require("superagent");
let cheerio = require("cheerio");
let async = require("async");
let eventproxy = require('eventproxy');
spider = {
    ep: new eventproxy(),
    pageUrls: [],
    tabTitle: [],
    setUrl: function() {
        this.pageUrls.push('http://www.gushiwen.org');
    },
    onRequest: function() {
        this.setUrl();
        this.pageUrls.forEach((pageUrl) => {
            superagent.get(pageUrl).end(function(err,pres){
                if (err) {
                    console.log(err);
                }
                // pres.text 里面存储着请求返回的 html 内容，将它传给 cheerio.load 之后
                // 就可以得到一个实现了 jquery 接口的变量，我们习惯性地将它命名为 `$`
                // 剩下就都是 jquery 的内容了
                let $ = cheerio.load(pres.text);
                let types = $('.right .sons');
                for (let i = 0; i < types.length; i++) {
                    let title = $(types[i]).children('.title').text();
                    this.tabTitle.push(title);
                }
                // var curPageUrls = $('.titlelnk');
                // for(var i = 0 ; i < curPageUrls.length ; i++){
                //     var articleUrl = curPageUrls.eq(i).attr('href');
                //     urlsArray.push(articleUrl);
                //     // 相当于一个计数器
                //     ep.emit('BlogArticleHtml', articleUrl);
                // }
            });
        });
    }
};
module.exports = spider;

