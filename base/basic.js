let http = require("http");
let url = require("url");
let superagent = require("superagent");
let MongoDB = require('./../dataBase/dbHelper');

let basic = {
    getPoetryList: function(pageNo, pageSize){
        return new Promise((resolve, reject) => {
            let data = {
                errorCode: 0,
                errorMsg: '',
                list: {}
            };
            if (!pageNo || !pageSize || pageNo <= 0 || pageSize <= 0) {
                data.errorCode = 1;
                data.errorMsg = '参数错误！'
                reject(data);
            } else {
                MongoDB.where('poetry',{}, {sort: {time: -1}, limit: parseInt(pageSize), skip: parseInt(pageNo*pageSize)}, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        data.list = result;
                        resolve(data);
                    }
                });
            }
        });
    },
    getClassify: function(tab, title) {
        return new Promise((resolve, reject) => {
            let data = {
                errorCode: 0,
                errorMsg: '',
                list: {}
            };
            if (!tab || !title) {
                data.errorCode = 1;
                data.errorMsg = '参数错误！'
                reject(data);
            } else {
                title = title + '：';
                MongoDB.find('classify',{tab: tab, title: title}, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        data.list = result;
                        resolve(data);
                    }
                });
            }
        })
    }
};
module.exports = basic;