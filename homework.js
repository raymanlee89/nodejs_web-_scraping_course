const Nightmare = require('nightmare');
const nightmare = Nightmare({ show: true, width: 1024, height: 960 });

const fs = require('fs');
const util = require('util');
const exec = util.promisify( require('child_process').exec );

const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const { window } = new JSDOM();
const $ = require('jquery')(window);

const headers = {
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'zh-TW,zh;q=0.9,ja-JP;q=0.8,ja;q=0.7,en-US;q=0.6,en;q=0.5',
};

const urlOrigin = "https://www.bookwormzz.com";
const url = urlOrigin + '/zh/';
const arrLink = [];

async function init()
{
    if( !fs.existsSync(`downloads/homework`) ){
        fs.mkdirSync(`downloads/homework`);
    }
}

async function visit()
{
    await nightmare
    .goto(url, headers);
}

async function scroll()
{
    /**
     * innertHeightOfWindow: 視窗內 document 區域的內部高度
     * totalOffset: 目前滾動的距離
     */
    let innerHeightOfWindow = 0, totalOffset = 0;

    while(totalOffset <= innerHeightOfWindow)
    {
        innerHeightOfWindow = await nightmare.evaluate(function()
        {
            return document.documentElement.scrollHeight;
        });

        totalOffset += 500;

        await nightmare.scrollTo(totalOffset, 0).wait(500);

        console.log(`totalOffset = ${totalOffset}, innerHeightOfWindow = ${innerHeightOfWindow}`);
    }
}

async function getNovelTitles()
{
    let html = await nightmare.evaluate(function()
    {
        return document.documentElement.innerHTML;
    });
    
    $(html).find('div.ui-collapsible-content.ui-body-b.ui-collapsible-content-collapsed').each(function(index, element){
        $(element).find('a').each(function(idx, elm)
        {
            /**
             * 下方的 href，在網頁上預設文字是編碼(encode)後的文字，
             * 例如 %E9%87%91%E5%BA%B8%E3%80%8A%E5%80%9A%E5%A4%A9%E5%B1%A0%E9%BE%8D%E8%A8%98%E4%BA%8C%E3%80%8B
             * 透過 decodeURIComponent(...) 來解碼，
             * 可以取得正常的中文，例如上方例子解碼後，原文字為「金庸《倚天屠龍記二》」
             */
            let strTmp = $(elm).attr('href');
            

            if(strTmp !== 'http://www.haodoo.net/')
            {
                strTmp = strTmp.replace(/\.\.\//g, '');
                strTmp = decodeURIComponent(strTmp);

                let obj = 
                {
                    url: `${urlOrigin}/${strTmp}#book_toc`,
                    title: $(elm).text(),
                    links: []
                }; 
                
                console.log(`getNovelTitles(): ${obj.url}`);

                arrLink.push(obj);
            }
        });
    });
}

async function getNovelLinks()
{
    for(let obj of arrLink)
    {
        //走訪實際連結頁面
        await nightmare
        .goto(obj.url, headers)
        .wait(500);

        //取得小說連結
        let html = await nightmare.evaluate(function()
        {
            return document.documentElement.innerHTML;
        });
        
        //整合 href 的連結，並加上真實的目錄連結
        $(html).find('div[data-content-theme = "c"] > ul > li > a').each(function(index, element)
        {
            let strTmp = $(element).attr('href');
            
            //暫存資料用的物件
            let objLink = {
                url: `${urlOrigin}${strTmp}`,
                title: $(element).text(),
                content:  null
            }; 

            console.log(`getNovelLinks(): ${urlOrigin}${strTmp}`);
            
            //目前走訪到的文章物件，在裡面的 links 屬性
            obj.links.push(objLink);
        });

        await nightmare
        .wait(500);
    }
}

async function getNovelContent()
{
    for(let obj of arrLink)
    {
        for(let objLink of obj.links)
        {
            await nightmare
            .goto(objLink.url, headers)
            .wait(500);

            console.log(`getNovelContent(): ${objLink.url}`);

            let html = await nightmare.evaluate(function()
            {
                return document.documentElement.innerHTML;
            });
            
            //取得小說內文 (含空白、斷行那些)
            let strContent = $(html).find('div#html[data-role="content"] > div:nth-of-type(1)').text();

            //將小說內文的空格、斷行全部去掉，讓文字變成「一整行文字」的概念
            objLink.content = strContent;

            await nightmare
            .wait(500);
        }
    }
}

async function close()
{
    await nightmare.end(() => {
        console.log(`關閉 nightmare`);
    });
}

async function saveJson()
{
    await fs.writeFileSync('downloads/homework.json', JSON.stringify(arrLink, null, 4));
}

async function downloadTxt()
{
    let strJson = await fs.readFileSync(`downloads/homework.json`);
    let arrLink = JSON.parse(strJson);
    let count = 1;

    for(let obj of arrLink)
    {
        for(let objLink of obj.links)
        {
            if( objLink.content === "" ) continue;

            /**
             * count.toString().padStart(4,'0')
             * 上一行範例，是指將數值 count 轉成字串後，
             * 再透過 .padStart() 來向左方填補 0，格式化為 4 位數的數字
             * 例如 0001, 0012, 0456, 1002 等等
             */
            let strFileName = `${obj.title}_${objLink.title}`; //將檔案名稱串接起來
            strFileName = strFileName.replace(/\/|,|\(|\)|\.txt|—|\s|:|\./g, ''); //去除不需要的文字
            strFileName = `${count.toString().padStart(4,'0')}_jinyong_${strFileName}.txt`; //加上副檔名

            console.log(strFileName); 
            count++;

            //若檔案不存在，則新增檔案，同時寫入內容
            if(! await fs.existsSync(`downloads/homework/${strFileName}`))
            {
                await fs.writeFileSync(`downloads/homework/${strFileName}`, objLink.content);
            }
        }
    }
}

async function asyncArray(functionList)
{
    for(let func of functionList){
        await func();
    }
}

(
    async function ()
    {
        await asyncArray([
            init,
            visit,
            scroll,
            getNovelTitles,
            getNovelLinks,
            getNovelContent,
            saveJson,
            downloadTxt,
            close
        ]).then(async function()
        {
            console.log('Done');
        })
    }
)()