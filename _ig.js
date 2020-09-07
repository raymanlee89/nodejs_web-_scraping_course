//瀏覽器自動化工具
const Nightmare = require('nightmare');
const nightmare = Nightmare({ show: true, width: 1024, height: 960 });

//常用套件
const fs = require('fs');
const util = require('util');
const exec = util.promisify( require('child_process').exec );

//雜湊套件
const crypto = require('crypto');

//引入 jQuery 機制
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { window } = new JSDOM();
const $ = require('jquery')(window);

//設定 request headers
const headers = {
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
};

//帳號密碼設定
const config = require("./ig_config.js");

//放置網頁元素(物件)
const arrData = [], arrLink = [];

//目標網址(要抓取資料的網址)
const url = "https://www.instagram.com/ntu.library/";

//初始化設定
async function init()
{
    //若沒有資料夾，則新增
    if( ! await fs.existsSync(`downloads/ig`) )
    {
        await fs.mkdirSync(`downloads/ig`, {recursive: true});
    }
}

//登入
async function login()
{
    await nightmare
    .goto("https://www.instagram.com", headers)
    .wait('input[name="username"]')
    .type('input[name="username"]', config.username)
    .type('input[name="password"]', config.password)
    .wait(3000)
    .click('button[type="submit"].sqdOP.L3NKy.y3zKF');
}

async function visit(){
    await nightmare.wait(2000).goto(url, headers);
}

//滾動畫面
async function scroll()
{
    //等待第一列 (3 個照片元素為 1 列)
    await nightmare.wait('div.Nnq7C.weEfm');

    let innerHeightOfWindow = 0, totalOffset = 0;

    while(totalOffset <= innerHeightOfWindow)
    {
        //取得視窗內 document 區域的內部高度
        innerHeightOfWindow = await nightmare.evaluate(() => {
            return document.documentElement.scrollHeight;
        });

        //增加滾動距離的數值
        totalOffset += 500;

        //滾動到 totalOffset 指定的距離
        await nightmare.scrollTo(totalOffset, 0).wait(500);

        console.log(`totalOffset = ${totalOffset}, innerHeightOfWindow = ${innerHeightOfWindow}`);

        if( totalOffset > 1000 )
        {
            break;
        }
    }
}

async function getUrl()
{
    let html = await nightmare.evaluate(function()
    {
        return document.documentElement.innerHTML;
    });

    $(html).find('div.Nnq7C.weEfm div.v1Nh3.kIKUG._bz0w').each(function(index, element)
    {
        $(element).find('a').each(function(idx, elm)
        {
            //取得項目 a 當中 href 屬性的值
            let aLink = $(elm).attr('href');

            console.log(`get : ${aLink}`);
            
            arrLink.push('https://www.instagram.com' + aLink);
        })
    })
}

async function parse()
{
    for(let aLink of arrLink)
    {
        await nightmare.goto(aLink, headers);

        let regex = /\/p\/([a-zA-Z0-9_]+)/g;
        let match = regex.exec(aLink);
        let pageId = match[1];
        console.log(`link : ${aLink}, ID : ${pageId}`);

        await nightmare.wait(2000);

        objTmp = {};

        
        if(await nightmare.exists('button._6CZji'))
        {
            //deal with multi-items
            await _parseMultipleItems();

            arrData.push({
                "id": pageId,
                "url": aLink,
                "content": objTmp
            });
        }
        else
        {
            //deal with one item
            let html = await nightmare.evaluate(function() {
                return document.documentElement.innerHTML;
            });

            if ( await nightmare.exists('article.QBXjJ.M9sTE.L_LMM.JyscU.ePUX4 img.FFVAD') ){
                //取得 img 連結
                let imgSrc = $(html).find('article.QBXjJ.M9sTE.L_LMM.JyscU.ePUX4 img.FFVAD').attr('src');

                //hash img 連結，作為 dict 的 key
                let strKey = await _md5(imgSrc);

                //建立 img 的 key-value
                objTmp[strKey] = imgSrc;
            }
            else if( await nightmare.exists('article.QBXjJ.M9sTE.L_LMM.JyscU.ePUX4 video.tWeCl') )
            {
                //取得 video 連結
                let videoSrc = $(html).find('article.QBXjJ.M9sTE.L_LMM.JyscU.ePUX4 video.tWeCl').attr('src');
                
                //hash video 連結，作為 dict 的 key
                let strKey = await _md5(videoSrc);
                
                //建立 video 的 key-value
                objTmp[strKey] = videoSrc;
            }

            //新增元素資訊到 arrData
            arrData.push({
                "id": pageId,
                "url": aLink,
                "content": objTmp
            });
        }
    }
}

async function _parseMultipleItems()
{
    if(await nightmare.exists('button._6CZji'))
    {
        await nightmare.click('button._6CZji');

        let html = await nightmare.evaluate(function(){
            return document.documentElement.innerHTML;
        });

        $(html).find('li.Ckrof').each(async function(index, element){
            if ( $(element).find('img.FFVAD').length > 0 ){
                //取得 img 連結
                let imgSrc = $(element).find('img.FFVAD').attr('src');
                //hash img 連結，作為 dict 的 key
                let strKey = await _md5(imgSrc);

                //建立 img 的 key-value
                objTmp[strKey] = imgSrc;
            } else if ( $(element).find('video.tWeCl').length > 0 ) {
                //取得 video 連結
                let videoSrc = $(element).find('video.tWeCl').attr('src');
                
                //hash video 連結，作為 dict 的 key
                let strKey = await _md5(videoSrc);
                
                //建立 video 的 key-value
                objTmp[strKey] = videoSrc;
            }
        })

        //強制等待
        await nightmare.wait(1000);

        //遞迴
        await _parseMultipleItems();
    }
}

//建立雜湊值 (hash)
async function _md5(str)
{
    return crypto.createHash('md5').update(str).digest('hex');
}

//將 arrData 存成 json
async function saveJson()
{
    //新增檔案，同時寫入內容
    await fs.writeFileSync(`downloads/ig.json`, JSON.stringify(arrData, null, 4));
}

//關閉 nightmare
async function close()
{
    await nightmare.end(() => {
        console.log(`關閉 nightmare`);
    });
}

async function download(){
    let strJson = await fs.readFileSync('downloads/ig.json', {encoding: 'utf-8'})
    let arr = JSON.parse(strJson);

    for(let obj of arr)
    {
        for(let key in obj['content'])
        {
            let regex = /https?:\/\/\S+.\/(\S+\.(jpe?g|mp4))/g;
            let match = regex.exec(obj['content'][key]);
            let dl_link = obj['content'][key];

            console.log(`download : ${match[1]}`);
            await exec(`curl -k -X GET "${dl_link}" -o "downloads/ig/${match[1]}"`);
        }
    }
}

//透過迴圈特性，將陣列中的各個 function 透過 await 逐一執行
async function asyncArray(functionList)
{
    for(let func of functionList){
        await func();
    }
}

//IIFE
(
    async function ()
    {
        await asyncArray([
            // init, 
            // login,
            // visit,
            // scroll,
            // getUrl,
            // parse,
            // saveJson,
            // close,
            download
        ]).then(async ()=>{
            console.log('Done');
        });
    }
)();
