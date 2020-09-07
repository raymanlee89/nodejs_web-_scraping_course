const fs = require('fs');

//引入 jQuery 機制
const { JSDOM } = require("jsdom");
const { window } = new JSDOM("");
const $ = require('jquery')(window);

//引入 selenium 功能
const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

//等待元素出現與否所使用的物件
const until = webdriver.until;

const chromeCapabilities = webdriver.Capabilities.chrome();
chromeCapabilities.set('browserName', 'chrome');
chromeCapabilities.set('chromeOptions', {
    args: ['user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36"']
});

const options = new chrome.Options();

//build a web driver
const Builder = webdriver.Builder;
const driver = new Builder()
.forBrowser('chrome')
.setChromeOptions(options)
.withCapabilities(chromeCapabilities)
.build();

const urlOrigin = "https://www.bookwormzz.com";
const url = urlOrigin + '/zh/';
let arrLink = [];

async function init()
{
    if ( ! await fs.existsSync(`downloads/jinyong`) )
    { 
        await fs.mkdirSync(`downloads/jinyong`); //建立資料夾
    }
}

async function visit(){
    await driver.get(url);
}

async function scroll()
{
    /**
     * innertHeightOfWindow: 視窗內 document 區域的內部高度
     * totalOffset: 目前滾動的距離
     */
    let innerHeightOfWindow = 0;
    let totalOffset = 0;

    while(totalOffset <= innerHeightOfWindow) 
    {
        innerHeightOfWindow = await driver.executeScript(`return window.innerHeight;`);

        totalOffset += 500;

        await driver.executeScript(`
            (
                function (){
                    window.scrollTo({ 
                        top: ${totalOffset}, 
                        behavior: "smooth" 
                    });
                }
            )();
        `);
        
        console.log(`totalOffset: ${totalOffset}, innerHeightOfWindow: ${innerHeightOfWindow}`);

        //強制等待
        await driver.sleep(500);
    }
}

async function getNovelTitles()
{
    await driver.wait(until.elementLocated({css: 'div.epub ul[data-role="listview"] li a'}), 3000);

    let html = await driver.getPageSource();

    $(html).find('a[data-ajax="false"]').each(function(index, element)
    {
        let strTmp = $(element).attr('href');
        strTmp = strTmp.replace(/\.\.\//g, '');
        strTmp = decodeURIComponent(strTmp);

        let obj = {
            url: `${urlOrigin}/${strTmp}#book_toc`,
            title: $(element).text(),
            links: []
        };

        console.log(`getNovelTitles(): ${obj.url}`);

        arrLink.push(obj);
    });
}

async function getNovelLinks(){
    for(let obj of arrLink)
    {
        await driver.get(obj.url);

        await driver
        .wait(until.elementLocated({css: 'div[data-role="content"] > div > ul'}), 3000)
        .catch(function(err)
        {
            return true;
        });

        let html = await (await driver).getPageSource();

        $(html).find('a.ui-link').each(function(index, element)
        {
            let strTmp = $(element).attr('href');

            let objLink = {
                url: `${urlOrigin}${strTmp}`,
                title: $(element).text(),
                content: null
            };

            console.log(`getNovelLinks(): ${urlOrigin}${strTmp}`);

            obj.links.push(objLink);
        });

        await driver.sleep(500);
    }
}

async function getNovelContent(){
    for(let obj of arrLink)
    {
        await (await driver).getPageSource(objLink.url);

        console.log(`getNovelContent(): ${objLink.url}`);

        await driver
        .wait(until.elementLocated({css: 'div#html[data-role="content"] > div:nth-of-type(1)'}), 3000)
        .catch(function(err){
            return true;
        });

        let html = await driver.getPageSource();

        let strContent = $(html).find('div#html[data-role="content"] > div:nth-of-type(1)').text();

        objLink.content = strContent;

        await (await driver).sleep(500);
    }
}

async function close(){
    await driver.quit();
}

async function saveJson(){
    //新增檔案，同時寫入內容
    await fs.writeFileSync('downloads/jinyong.json', JSON.stringify(arrLink, null, 4));
}

async function asyncArray(functionsList) {
    for(let func of functionsList){
        await func();
    }
}

(
    async function(){
        await asyncArray([
            init,
            visit,
            scroll,
            getNovelTitles,
            getNovelLinks,
            //getNovelContent,
            close,
            saveJson
        ]).then(async function() {
            console.log('Done');     
        });
    }
)();