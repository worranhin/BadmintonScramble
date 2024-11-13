// ==UserScript==
// @name         华工五山体育场地预订
// @namespace    http://worranhin.github.io/
// @version      v0.2.0
// @description  自动发送网络请求以试图更高效地订场地。
// @author       worranhin
// @match        https://venue.spe.scut.edu.cn/vb-user/booking
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scut.edu.cn
// @grant        none
// ==/UserScript==



function main() {
    'use strict';

    /// 配置：用户应自行更改这些参数；
    /// UserId 请在页面按 F12 进入网络选项卡，然后随便提交一个订单，选择名为 apply的 POST 请求，查看其消息头
    /// 鄙人不知道其它获取方法
    let config = {};
    config.Authorization = null; // 令牌，长这样 "Bearer eyJ0eXAiOiJKV1Q..."，现已实现自动获取，也可以自己输入
    config.UserId = 0; // 用户 ID
    config.startTime = "08:00"; // 时间段
    config.endTime = "09:00";
    config.week = 7; // 星期几
    config.receipts = 20; // 金额
    config.venue = 15; // 场地，目前未完全支持，欢迎 PR
    config.date = "2024-11-10"; // 日期

    const scrambler = new Scrambler(config);

    // 通过劫持 XMLHttpRequest 的 setRequestHeader 方法，自动更新 Authorization, 不需要可以注释掉
    let oldSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (...args) {
        //console.log("From setRequestHeader", args);
        if (args[0] === "Authorization" && scrambler.Authorization === null) {
            scrambler.updateAuthorization(args[1]);
            console.log(scrambler.Authorization);
        }
        return oldSetHeader.call(this, ...args);
    }

    scrambler.bookInterval("week", 1);  // 这里调用 scrambler 的方法，示例为以 week 模式调用一定次数
}

class Scrambler {
    VenueId = { // 场地 ID 字典
        15: 5128057837898,
        16: 512885983484899
    }

    PingPongVenueId = {
        14: 508739189072477
    }

    Authorization;
    UserId; // 用户 ID
    startTime; // 时间段
    endTime;
    week; // 星期几
    receipts; // 金额
    venue; // 场地
    date; // 日期，如果按月预定则填写下个月的最后一天
    #trys = 0; // 重试次数
    #header;
    #applyUrl = "https://venue.spe.scut.edu.cn/api/pc/order/rental/orders/apply";
    #payUrl = "https://venue.spe.scut.edu.cn/api/pc/order/rental/orders/pay";

    /**
     * Scrambler constructor
     * @param {Object} config configuration object, containing properties:
     * @param {string} config.Authorization authorization token
     * @param {number} config.UserId user ID
     * @param {string} config.startTime start time
     * @param {string} config.endTime end time
     * @param {number} config.week week number
     * @param {number} config.receipts receipts
     * @param {number} config.venue venue ID
     * @param {string} config.date date, if booking by month, fill in the last day of the next month
     */
    constructor(config) {
        for (let key in config) {
            this[key] = config[key];
        }

        this.#header = new Headers({
            "Host": "venue.spe.scut.edu.cn",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            // "Referer": "https://venue.spe.scut.edu.cn/vb-user/booking",
            "Content-Type": "application/json",
            "Authorization": this.Authorization,
            "Origin": "https://venue.spe.scut.edu.cn"
        });
    }

    async bookInterval(mode = "month", maxTrys = 10) {
        let trys = 0;
        let success = false;
        let bookMode = null;

        if (mode === "month") {
            bookMode = this.bookMonthly;
        } else if (mode === "week") {
            bookMode = this.bookWeekly;
        } else {
            console.log("Book mode unsupport! Must be `month` or `week`");
            return;
        }

        const trying = () => {
            if (this.Authorization === null) {
                console.log("No Authorization, retry after 1 second");
                setTimeout(trying, 1000)
            } else {
                bookMode.call(this).then((res) => {
                    console.log("Book succeeded!", res);
                }).catch((err) => {
                    if (++trys < maxTrys) {
                        console.log(err, `Retrying ${trys}`);
                        setTimeout(trying, 1000);
                    }
                });
            }
        }
        trying();
    }

    /**
     * Try to fetch the apply request and pay the order if succeeds.
     * If the request fails, retry after 1 second.
     * @param {number} maxTrys maximum number of retries
     * @returns {Promise} a promise that resolves to the pay info if succeeds, or rejects with an error object if fails
     */
    async bookMonthly() {
        const applyMonthBody = {
            "userId": this.UserId,
            "receipts": this.receipts,
            "buyerSource": 4,
            "stadiumId": 1,
            "mode": "month",
            "rentals": [{
                "belongDate": this.GetBelongDate(this.date),
                "week": this.week,
                "start": this.startTime,
                "end": this.endTime,
                "venueId": this.VenueId[this.venue]
            }]
        }

        const applyMonthOption = {
            method: "POST",
            headers: this.#header,
            body: JSON.stringify(applyMonthBody),
            mode: "cors",
            cache: "no-cache"
        };

        const applyMonthRequest = new Request(this.#applyUrl, applyMonthOption);
        try {
            const res = await this.tryBook(applyMonthRequest);
            console.log(res);
            return await Promise.resolve(res);
        } catch (err) {
            console.log(err);
            return await Promise.reject(err);
        }
    }

    async bookPingPongMonthly() {
        const applyMonthBody = {
            "userId": this.UserId,
            "receipts": this.receipts,
            "buyerSource": 4,
            "stadiumId": 1,
            "mode": "month",
            "rentals": [{
                "belongDate": this.GetBelongDate(this.date),
                "week": this.week,
                "start": this.startTime,
                "end": this.endTime,
                "venueId": this.PingPongVenueId[this.venue]
            }]
        }

        const applyMonthOption = {
            method: "POST",
            headers: this.#header,
            body: JSON.stringify(applyMonthBody),
            mode: "cors",
            cache: "no-cache"
        };

        const applyMonthRequest = new Request(this.#applyUrl, applyMonthOption);
        try {
            const res = await this.tryBook(applyMonthRequest);
            console.log(res);
            return await Promise.resolve(res);
        } catch (err) {
            console.log(err);
            return await Promise.reject(err);
        }
    }

    async bookWeekly() {
        const applyWeekBody = {
            "mode": "week",
            "userId": this.UserId,
            "receipts": this.receipts,
            "rentals": [
                {
                    "belongDate": this.GetBelongDate(this.date),
                    "start": this.startTime,
                    "end": this.endTime,
                    "venueId": this.VenueId[this.venue],
                    "week": this.week
                }
            ],
            "buyerSource": 4,
            "stadiumId": 1
        }

        const applyWeekOption = {
            method: "POST",
            headers: this.#header,
            body: JSON.stringify(applyWeekBody),
            mode: "cors",
            cache: "no-cache"
        };

        const applyWeekRequest = new Request(this.#applyUrl, applyWeekOption);
        try {
            const res = await this.tryBook(applyWeekRequest);
            console.log(res);
            return await Promise.resolve(res);
        } catch (err) {
            console.log(err);
            return await Promise.reject(err);
        }
    }

    tryBook(req) {
        return fetch(req).then((response) => { // Post Apply
            if (response.ok) {
                return response.json();
            } else {
                return Promise.reject({
                    "Error": "Apply Error",
                    "Data": response
                });
            }
        }).then((data) => { // Process Apply Body as json
            if (data.code === 1) {
                console.log("Apply Response: ", data);
                const id = data.data.id;
                const payBody = {
                    "id": id,
                    "payMethod": 1,
                    "payType": "wx_native"
                };

                const payOption = {
                    method: "POST",
                    headers: this.#header,
                    body: JSON.stringify(payBody),
                    mode: "cors",
                    cache: "no-cache"
                };

                const payRequest = new Request(this.#payUrl, payOption);
                return fetch(payRequest);

            } else {
                return Promise.reject({
                    "Error": "Apply Error",
                    "data": data
                });
            }
        }).then(response => { // Post Pay
            if (response.ok) {
                return response.json();
            } else {
                return Promise.reject({
                    "Error": "Pay Error",
                    "data": response
                });
            }
        }).then(res => { // Process Pay Body as json
            console.log("Pay Response: ", res);
            if (res.code === 1) {
                // window.location.assign('https://venue.spe.scut.edu.cn/vb-user/order-confirm/' + res.data.id);
                const payInfo = res.data.payInfo;
                console.log(payInfo);
                // window.location.assign(payInfo);
            } else {
                return Promise.reject(res);
            }
        }
        ).catch(error => {
            console.log("Error: ", error);
            return Promise.reject(error);
        });
    }

    /**
     * Calculates the belong date in milliseconds from a given date string.
     *
     * @param {string} date - The input date in the format "YYYY-MM-DD".
     * @returns {number} The corresponding belong date in milliseconds since the Unix epoch.
     */
    GetBelongDate(date) {
        return new Date(date).getTime();
    }

    updateAuthorization(auth) {
        if (auth) {
            this.Authorization = auth;
            this.#header = new Headers({
                "Host": "venue.spe.scut.edu.cn",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Referer": "https://venue.spe.scut.edu.cn/vb-user/booking",
                "Content-Type": "application/json",
                "Authorization": auth,
                "Origin": "https://venue.spe.scut.edu.cn"
            });
        }
    }
}

// (function () {
//     'use strict';

//     const scrambler = new Scrambler(config);
//     scrambler.bookWeekly();
// })();

main();
