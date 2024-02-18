// ==UserScript==
// @name        Furaffinity-Request-Helper
// @namespace   Violentmonkey Scripts
// @grant       none
// @version     1.0.3
// @author      Midori Dragon
// @description Helper Library to simplyfy requests to Furaffinity
// @icon        https://www.furaffinity.net/themes/beta/img/banners/fa_logo.png?v2
// @homepageURL https://greasyfork.org/de/scripts/483952-furaffinity-request-helper
// @supportURL  https://greasyfork.org/de/scripts/483952-furaffinity-request-helper/feedback
// @license     MIT
// ==/UserScript==

// jshint esversion: 8

(() => {
  //#region Helper Classes
  class Semaphore {
    constructor(maxConcurrency) {
      this.maxConcurrency = maxConcurrency;
      this.currentConcurrency = 0;
      this.waitingQueue = [];
    }

    acquire() {
      return new Promise((resolve, reject) => {
        if (this.currentConcurrency < this.maxConcurrency) {
          this.currentConcurrency++;
          resolve();
        } else this.waitingQueue.push(resolve);
      });
    }

    release() {
      if (this.waitingQueue.length > 0) {
        let nextResolve = this.waitingQueue.shift();
        nextResolve();
      } else this.currentConcurrency--;
    }
  }

  class PercentHelper {
    constructor() {
      throw new Error("The PercentHelper class cannot be instantiated.");
    }

    static percentAll = [];

    static setPercentValue(id, value) {
      if (id && value && PercentHelper.percentAll.hasOwnProperty(id)) {
        PercentHelper.percentAll[id] = value;
        return true;
      } else return false;
    }

    static getPercentValue(id, decimalPlaces = 2) {
      if (!id) return -1;
      const percent = PercentHelper.percentAll[id];
      if (!percent) return -1;
      return percent.toFixed(decimalPlaces);
    }

    static createPercentValue(uniqueId) {
      if (!uniqueId) uniqueId = Date.now() + Math.random();
      PercentHelper.percentAll[uniqueId] = 0;
      return uniqueId;
    }

    static deletePercentValue(id) {
      if (PercentHelper.percentAll.hasOwnProperty(id)) delete PercentHelper.percentAll[id];
    }
  }

  class WaitAndCallAction {
    constructor(action, usePercent, delay = 100) {
      this.action = action;
      this.delay = delay;
      this.intervalId;
      this.usePercent = usePercent;
      this._running = false;
    }

    start() {
      if (this.action && !this._running) {
        this._running = true;
        this.intervalId = setInterval(() => {
          if (this.usePercent) this.action(PercentHelper.getPercentValue(this.intervalId));
          else this.action();
        }, this.delay);
        if (this.usePercent) PercentHelper.createPercentValue(this.intervalId);
        return this.intervalId;
      }
    }
    stop() {
      if (this._running) {
        this._running = false;
        clearInterval(this.intervalId);
        if (this.usePercent) PercentHelper.deletePercentValue(this.intervalId);
      }
    }
  }

  class Parameters {
    constructor() {
      this.allParameters = [];
    }

    get length() {
      return this.allParameters.length;
    }

    setParameter(name, value) {
      this.allParameters[name] = value;
    }

    getParameter(name) {
      if (this.allParameters.hasOwnProperty(name)) return this.allParameters[name];
    }

    removeParameter(name) {
      if (this.allParameters.hasOwnProperty(name)) delete this.allParameters[name];
    }
  }
  //#endregion

  //#region Request Helper
  class FuraffinityRequestHelper {
    constructor(maxAmountRequests = 2) {
      this._semaphore = new Semaphore(maxAmountRequests);
      this.UserRequests = new UserRequests(this._semaphore);
      this.PersonalUserRequests = new PersonalUserRequests(this._semaphore);
      this.SubmissionRequests = new SubmissionRequests(this._semaphore);
    }

    set maxAmountRequests(value) {
      if (this._semaphore.maxConcurrency == value) return;
      this._semaphore.maxConcurrency = value;
    }
    get maxAmountRequests() {
      return this._semaphore.maxConcurrency;
    }

    set useHttps(value) {
      if (this._useHttps == value) return;
      this._useHttps = value;
      if (value) _httpsString = "https://";
      else _httpsString = "http://";
    }
    get useHttps() {
      return this._useHttps;
    }

    static logLevel = 1;
    static domain = "www.furaffinity.net";
    static _useHttps = true;
    static _httpsString = "https://";

    static getUrl() {
      return FuraffinityRequestHelper._httpsString + FuraffinityRequestHelper.domain;
    }

    async getHTML(url, action, delay = 100) {
      const waitAndCallAction = new WaitAndCallAction(action, delay);
      waitAndCallAction.start();
      const html = await getHTMLLocal(url, this._semaphore);
      waitAndCallAction.stop();
      return html;
    }
  }
  window.FARequestHelper = FuraffinityRequestHelper;

  async function getHTMLLocal(url, semaphore) {
    const semaphoreActive = semaphore && semaphore.maxConcurrency > 0;
    if (semaphoreActive) await semaphore.acquire();
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      return doc;
    } catch (error) {
      logError(error);
    } finally {
      if (semaphoreActive) semaphore.release();
    }
  }

  async function sendHttpPostLocal(url, payload, semaphore) {
    const semaphoreActive = semaphore && semaphore.maxConcurrency > 0;
    if (semaphoreActive) await semaphore.acquire();
    try {
      const response = await fetch(url, {
        method: "POST",
        body: new URLSearchParams(
          payload.reduce((acc, { key, value }) => {
            acc.append(key, value);
            return acc;
          }, new URLSearchParams())
        ).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!response.ok) {
        logError(`HTTP error! Status: ${response.status}`);
        return;
      }

      const responseData = await response.text();
      return responseData;
    } catch (error) {
      logError(error);
    } finally {
      if (semaphoreActive) semaphore.release();
    }
  }

  //#endregion

  //#region User Requests
  class UserRequests {
    constructor(semaphore) {
      this.semaphore = semaphore;
      this.GalleryRequests = new GalleryRequests(semaphore);
    }

    static hardLinks = {
      user: FuraffinityRequestHelper.getUrl() + "/user/",
      watch: FuraffinityRequestHelper.getUrl() + "/watch/",
      unwatch: FuraffinityRequestHelper.getUrl() + "/unwatch/",
      block: FuraffinityRequestHelper.getUrl() + "/block/",
      unblock: FuraffinityRequestHelper.getUrl() + "/unblock/",
    };

    async getUserPage(username, action, delay = 100) {
      return await getUserPageHandleLocal(username, action, delay, this.semaphore);
    }

    async watchUser(username, watchKey, action, delay = 100) {
      return await watchUserHandleLocal(username, watchKey, action, delay, this.semaphore);
    }

    async unwatchUser(username, unwatchKey, action, delay = 100) {
      return await unwatchUserHandleLocal(username, unwatchKey, action, delay, this.semaphore);
    }

    async blockUser(username, blockKey, action, delay = 100) {
      return await blockUserHandleLocal(username, blockKey, action, delay, this.semaphore);
    }

    async unblockUser(username, unblockKey, action, delay = 100) {
      return await unblockUserHandleLocal(username, unblockKey, action, delay, this.semaphore);
    }
  }

  async function getUserPageHandleLocal(username, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const getUserPage = await getUserPageLocal(username, semaphore);
    waitAndCallAction.stop();
    return getUserPage;
  }

  async function getUserPageLocal(username, semaphore) {
    if (!username) {
      logWarning("No username given");
      return null;
    }

    if (!UserRequests.hardLinks["user"].endsWith("/")) UserRequests.hardLinks["user"] += "/";

    const url = UserRequests.hardLinks["user"] + username;
    if (url) return await getHTMLLocal(url, semaphore);
    else return null;
  }

  async function watchUserHandleLocal(username, watchKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const success = await watchUserLocal(username, watchKey, semaphore);
    waitAndCallAction.stop();
    return success;
  }

  async function watchUserLocal(username, watchKey, semaphore) {
    if (!username) {
      logWarning("No username given");
      return null;
    }
    if (!watchKey) {
      logWarning("No watch key given");
      return null;
    }

    if (!UserRequests.hardLinks["watch"].endsWith("/")) UserRequests.hardLinks["watch"] += "/";
    const url = UserRequests.hardLinks["watch"] + username + "?key=" + watchKey;

    if (url) {
      if (await getHTMLLocal(url, semaphore)) return true;
      else return false;
    } else return false;
  }

  async function unwatchUserHandleLocal(username, unwatchKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const success = await unwatchUserLocal(username, unwatchKey, semaphore);
    waitAndCallAction.stop();
    return success;
  }

  async function unwatchUserLocal(username, unwatchKey, semaphore) {
    if (!username) {
      logWarning("No username given");
      return null;
    }
    if (!unwatchKey) {
      logWarning("No unwatch key given");
      return null;
    }

    if (!UserRequests.hardLinks["unwatch"].endsWith("/")) UserRequests.hardLinks["unwatch"] += "/";
    const url = UserRequests.hardLinks["unwatch"] + username + "?key=" + unwatchKey;

    if (url) {
      if (await getHTMLLocal(url, semaphore)) return true;
      else return false;
    } else return false;
  }

  async function blockUserHandleLocal(username, blockKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const success = await blockUserLocal(username, blockKey, semaphore);
    waitAndCallAction.stop();
    return success;
  }

  async function blockUserLocal(username, blockKey, semaphore) {
    if (!username) {
      logWarning("No username given");
      return null;
    }
    if (!blockKey) {
      logWarning("No block key given");
      return null;
    }

    if (!UserRequests.hardLinks["block"].endsWith("/")) UserRequests.hardLinks["block"] += "/";
    const url = UserRequests.hardLinks["block"] + username + "?key=" + blockKey;

    if (url) {
      if (await getHTMLLocal(url, semaphore)) return true;
      else return false;
    } else return false;
  }

  async function unblockUserHandleLocal(username, unblockKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const success = await unblockUserLocal(username, unblockKey, semaphore);
    waitAndCallAction.stop();
    return success;
  }

  async function unblockUserLocal(username, unblockKey, semaphore) {
    if (!username) {
      logWarning("No username given");
      return null;
    }
    if (!unblockKey) {
      logWarning("No unblock key given");
      return null;
    }

    if (!UserRequests.hardLinks["unblock"].endsWith("/")) UserRequests.hardLinks["unblock"] += "/";
    const url = UserRequests.hardLinks["unblock"] + username + "?key=" + unblockKey;

    if (url) {
      if (await getHTMLLocal(url, semaphore)) return true;
      else return false;
    } else return false;
  }
  //#endregion

  //#region Gallery Requests
  class GalleryRequests {
    constructor(semaphore) {
      this.semaphore = semaphore;
      this.Gallery = new Gallery(semaphore);
      this.Scraps = new Scraps(semaphore);
      this.Favorites = new Favorites(semaphore);
      this.Journals = new Journals(semaphore);
    }
  }

  class Gallery {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLink = FuraffinityRequestHelper.getUrl() + "/gallery/";

    async getFiguresTillId(username, toId, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, null, action, delay, "gallery", this.semaphore);
    }

    async getFiguresSinceId(username, fromId, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, null, action, delay, "gallery", this.semaphore);
    }

    async getFiguresBetweenIds(username, fromId, toId, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, null, null, action, delay, "gallery", this.semaphore);
    }

    async getFiguresTillIdSincePage(username, toId, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, fromPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFiguresSinceIdTillPage(username, fromId, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, toPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFiguresBetweenIdsBetweenPages(username, fromId, toId, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, fromPageNumber, toPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFiguresTillPage(username, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillPageHandleLocal(username, toPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFiguresSincePage(username, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresSincePageHandleLocal(username, fromPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFiguresBetweenPages(username, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, "gallery", this.semaphore);
    }

    async getFigures(username, pageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleLocal(username, pageNumber, action, delay, "gallery", this.semaphore);
    }

    async getPage(username, pageNumber, action, delay = 100) {
      return await getGalleryPageHandleLocal(username, pageNumber, action, delay, "gallery", this.semaphore);
    }
  }

  class Scraps {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLink = FuraffinityRequestHelper.getUrl() + "/scraps/";

    async getFiguresTillId(username, toId, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, null, action, delay, "scraps", this.semaphore);
    }

    async getFiguresSinceId(username, fromId, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, null, action, delay, "scraps", this.semaphore);
    }

    async getFiguresBetweenIds(username, fromId, toId, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, null, null, action, delay, "scraps", this.semaphore);
    }

    async getFiguresTillIdSincePage(username, toId, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, fromPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFiguresSinceIdTillPage(username, fromId, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, toPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFiguresBetweenIdsBetweenPages(username, fromId, toId, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, fromPageNumber, toPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFiguresTillPage(username, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillPageHandleLocal(username, toPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFiguresSincePage(username, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresSincePageHandleLocal(username, fromPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFiguresBetween(username, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, "scraps", this.semaphore);
    }

    async getFigures(username, pageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleLocal(username, pageNumber, action, delay, "scraps", this.semaphore);
    }

    async getPage(username, pageNumber, action, delay = 100) {
      return await getGalleryPageHandleLocal(username, pageNumber, action, delay, "scraps", this.semaphore);
    }
  }

  class Favorites {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLink = FuraffinityRequestHelper.getUrl() + "/favorites/";

    async getFiguresTillId(username, toId, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, null, action, delay, "favorites", this.semaphore);
    }

    async getFiguresSinceId(username, fromId, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, null, action, delay, "favorites", this.semaphore);
    }

    async getFiguresBetweenIds(username, fromId, toId, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, null, null, action, delay, "favorites", this.semaphore);
    }

    async getFiguresTillIdSincePage(username, toId, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillIdHandleLocal(username, toId, fromPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFiguresSinceIdTillPage(username, fromId, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresSinceIdHandleLocal(username, fromId, toPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFiguresBetweenIdsBetweenPages(username, fromId, toId, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, fromPageNumber, toPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFiguresTillPage(username, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresTillPageHandleLocal(username, toPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFiguresSincePage(username, fromPageNumber, action, delay = 100) {
      return await getGalleryFiguresSincePageHandleLocal(username, fromPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFiguresBetween(username, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, "favorites", this.semaphore);
    }

    async getFigures(username, pageNumber, action, delay = 100) {
      return await getGalleryFiguresHandleLocal(username, pageNumber, action, delay, "favorites", this.semaphore);
    }

    async getPage(username, pageNumber, action, delay = 100) {
      return await getGalleryPageHandleLocal(username, pageNumber, action, delay, "favorites", this.semaphore);
    }
  }

  class Journals {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLink = FuraffinityRequestHelper.getUrl() + "/journals/";

    async getFiguresTillId(username, toId, action, delay = 100) {
      return await getJournalsSectionsTillIdHandleLocal(username, toId, null, action, delay, this.semaphore);
    }

    async getFiguresSinceId(username, fromId, action, delay = 100) {
      return await getJournalsSectionsSinceIdHandleLocal(username, fromId, null, action, delay, this.semaphore);
    }

    async getFiguresBetweenIds(username, fromId, toId, action, delay = 100) {
      return await getJournalsSectionsBetweenIdsHandleLocal(username, fromId, toId, null, null, action, delay, this.semaphore);
    }

    async getFiguresTillIdSincePage(username, toId, fromPageNumber, action, delay = 100) {
      return await getJournalsSectionsTillIdHandleLocal(username, toId, fromPageNumber, action, delay, this.semaphore);
    }

    async getFiguresSinceIdTillPage(username, fromId, toPageNumber, action, delay = 100) {
      return await getJournalsSectionsSinceIdHandleLocal(username, fromId, toPageNumber, action, delay, this.semaphore);
    }

    async getFiguresBetweenIdsBetweenPages(username, fromId, toId, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getJournalsSectionsBetweenIdsHandleLocal(username, fromId, toId, fromPageNumber, toPageNumber, action, delay, this.semaphore);
    }

    async getSectionsTillPage(username, toPageNumber, action, delay = 100) {
      return await getJournalsSectionsTillPageHandleLocal(username, toPageNumber, action, delay, this.semaphore);
    }

    async getSectionsSincePage(username, fromPageNumber, action, delay = 100) {
      return await getJournalsSectionsSincePageHandleLocal(username, fromPageNumber, action, delay, this.semaphore);
    }

    async getSectionsBetweenPages(username, fromPageNumber, toPageNumber, action, delay = 100) {
      return await getJournalsSectionsHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, this.semaphore);
    }

    async getSections(username, pageNumber, action, delay = 100) {
      return await getJournalsSectionsHandleLocal(username, pageNumber, action, delay, this.semaphore);
    }

    async getPage(username, pageNumber, action, delay = 100) {
      return await getJournalsPageHandleLocal(username, pageNumber, action, delay, this.semaphore);
    }
  }

  async function getGalleryFiguresTillPageHandleLocal(username, toPageNumber, action, delay, galleryType, semaphore) {
    if (!toPageNumber || toPageNumber == 0) toPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    const percentId = waitAndCallAction.start();
    const getUserGalleryFiguresTillPage = await getGalleryFiguresTillPageLocal(username, toPageNumber, galleryType, percentId, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFiguresTillPage;
  }

  async function getGalleryFiguresSincePageHandleLocal(username, fromPageNumber, action, delay, galleryType, semaphore) {
    if (!fromPageNumber || fromPageNumber == 0) fromPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserGalleryFiguresSincePage = await getGalleryFiguresSincePageLocal(username, fromPageNumber, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFiguresSincePage;
  }

  async function getGalleryFiguresHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, galleryType, semaphore) {
    if (!fromPageNumber || fromPageNumber == 0) fromPageNumber = 1;
    if (!toPageNumber || toPageNumber == 0) toPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    const percentId = waitAndCallAction.start();
    const getUserGalleryFigureBetween = await getGalleryFiguresBetweenPagesLocal(username, fromPageNumber, toPageNumber, galleryType, percentId, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFigureBetween;
  }

  async function getGalleryFiguresHandleLocal(username, pageNumber, action, delay, galleryType, semaphore) {
    if (!pageNumber || pageNumber == 0) pageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserGalleryFigures = await getGalleryFiguresLocal(username, pageNumber, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFigures;
  }

  async function getGalleryPageHandleLocal(username, pageNumber, action, delay, galleryType, semaphore) {
    if (!pageNumber || pageNumber == 0) pageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserGalleryPage = await getGalleryPageLocal(username, pageNumber, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryPage;
  }

  async function getGalleryFiguresTillIdHandleLocal(username, toId, fromPage, action, delay, galleryType, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserGalleryFiguresTillId = await getGalleryFiguresTillIdLocal(username, toId, fromPage, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFiguresTillId;
  }

  async function getGalleryFiguresSinceIdHandleLocal(username, fromId, toPage, action, delay, galleryType, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserGalleryFiguresSinceId = await getGalleryFiguresSinceIdLocal(username, fromId, toPage, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFiguresSinceId;
  }

  async function getGalleryFiguresBetweenIdsHandleLocal(username, fromId, toId, fromPage, toPage, action, delay, galleryType, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    const percentId = waitAndCallAction.start();
    const getUserGalleryFiguresBetweenIds = await getGalleryFiguresBetweenIdsLocal(username, fromId, toId, fromPage, toPage, galleryType, percentId, semaphore);
    waitAndCallAction.stop();
    return getUserGalleryFiguresBetweenIds;
  }

  async function getGalleryFiguresTillIdLocal(username, toId, fromPage, galleryType, semaphore) {
    if (!toId) {
      logError("No toId given");
      return null;
    }

    let allFigures = [];
    let lastFigureId;
    let running = true;
    let i = 1;
    if (fromPage && fromPage >= 1) i = fromPage;
    while (running) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        if (idArrayContainsId(figures, toId)) {
          allFigures.push(getIdArrayTillId(figures, toId));
          running = false;
        } else {
          allFigures.push(figures);
          i++;
        }
      }
    }

    if (allFigures.length === 0) return null;
    else return allFigures;
  }

  async function getGalleryFiguresSinceIdLocal(username, fromId, toPage, galleryType, semaphore) {
    if (!fromId) {
      logError("No fromId given");
      return null;
    }

    let lastFigureId;
    let running = true;
    let i = 1;
    while (running) {
      if (toPage && toPage >= 1 && i == toPage) {
        running = false;
        break;
      }
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        if (idArrayContainsId(figures, fromId)) running = false;
        else i++;
      }
    }

    let allFigures = [];
    lastFigureId = null;
    running = true;
    while (running) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        allFigures.push(getIdArraySinceId(figures, fromId));
        i++;
      }
    }

    if (allFigures.length === 0) return null;
    else return allFigures;
  }

  async function getGalleryFiguresBetweenIdsLocal(username, fromId, toId, fromPage, toPage, galleryType, percentId, semaphore) {
    if (!fromId) {
      logError("No fromId given");
      return null;
    }
    if (!toId) {
      logError("No toId given");
      return null;
    }
    if (!fromPage || fromPage <= 0 || !toPage || toPage <= 1) {
      logWarning("No fromPage or toPage given. Percentages can not be calculated.");
      percentId = null;
    }
    let lastFigureId;
    let running = true;
    let i = 1;
    if (fromPage && fromPage >= 1) i = fromPage;
    while (running) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        if (idArrayContainsId(figures, fromId)) running = false;
        else i++;
      }
    }

    let allFigures = [];
    let completedPages = 0;
    lastFigureId = null;
    running = true;
    while (running) {
      if (toPage && toPage >= 1 && i == toPage) {
        running = false;
        break;
      }
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        if (idArrayContainsId(figures, toId)) {
          allFigures.push(getIdArrayBetweenIds(figures, fromId, toId));
          running = false;
        } else {
          allFigures.push(figures);
          i++;
        }
      }
    }

    completedPages++;
    if (percentId) {
      const progress = (completedPages / toPage) * 100;
      PercentHelper.setPercentValue(percentId, progress);
    }
  }

  async function getGalleryFiguresTillPageLocal(username, toPageNumber, galleryType, percentId, semaphore) {
    if (!toPageNumber) {
      logError("No toPageNumber given");
      return null;
    } else if (toPageNumber <= 0) {
      logError("toPageNumber must be greater than 0");
      return null;
    }

    let allFigures = [];
    let completedPages = 0;
    for (let i = 1; i <= toPageNumber; i++) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      if (figures && figures.length !== 0) allFigures.push(figures);

      completedPages++;
      if (percentId) {
        const progress = (completedPages / toPageNumber) * 100;
        PercentHelper.setPercentValue(percentId, progress);
      }
    }

    if (allFigures.length === 0) return null;
    else return allFigures;
  }

  async function getGalleryFiguresSincePageLocal(username, fromPageNumber, galleryType, semaphore) {
    if (!fromPageNumber) {
      logError("No fromPageNumber given");
      return null;
    } else if (fromPageNumber <= 0) {
      logError("fromPageNumber must be greater than 0");
      return null;
    }

    let allFigures = [];
    let lastFigureId;
    let running = true;
    let i = fromPageNumber;
    while (running) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      let currFigureId = lastFigureId;
      if (figures && figures.length !== 0) currFigureId = figures[0].id;
      if (currFigureId == lastFigureId) running = false;
      else {
        allFigures.push(figures);
        i++;
      }
    }

    if (allFigures.length === 0) return null;
    else return allFigures;
  }

  async function getGalleryFiguresBetweenPagesLocal(username, fromPageNumber, toPageNumber, galleryType, percentId, semaphore) {
    if (!fromPageNumber) {
      logError("No fromPageNumber given");
      return null;
    } else if (fromPageNumber <= 0) {
      logError("fromPageNumber must be greater than 0");
      return null;
    }
    if (!toPageNumber) {
      logError("No toPageNumber given");
      return null;
    } else if (toPageNumber <= 0) {
      logError("toPageNumber must be greater than 0");
      return null;
    }

    let allFigures = [];
    const direction = fromPageNumber < toPageNumber ? 1 : -1;
    const totalPages = Math.abs(toPageNumber - fromPageNumber) + 1;
    let completedPages = 0;
    for (let i = fromPageNumber; i <= toPageNumber; i += direction) {
      const figures = await getGalleryFiguresLocal(username, i, galleryType, semaphore);
      if (figures && figures.length !== 0) allFigures.push(figures);

      completedPages++;
      if (percentId) {
        const progress = (completedPages / totalPages) * 100;
        PercentHelper.setPercentValue(percentId, progress);
      }
    }

    if (allFigures.length === 0) return null;
    else return allFigures;
  }

  async function getGalleryFiguresLocal(username, pageNumber, galleryType, semaphore) {
    const galleryDoc = await getGalleryPageLocal(username, pageNumber, galleryType, semaphore);
    if (!galleryDoc || galleryDoc.getElementById("no-images")) {
      logMessage(`No images found at ${galleryType} of "${username}" on page "${pageNumber}".`);
      return null;
    }

    const figures = galleryDoc.getElementsByTagName("figure");
    if (!figures || figures.length === 0) {
      logMessage(`No figures found at ${galleryType} of "${username}" on page "${pageNumber}".`);
      return null;
    }

    return figures;
  }

  async function getGalleryPageLocal(username, pageNumber, galleryType, semaphore) {
    if (!username) {
      logError("No username given");
      return null;
    }
    if (!pageNumber) {
      logError("No page number given");
      return null;
    } else if (pageNumber <= 0) {
      logError("Page number must be greater than 0");
      return null;
    }
    if (!galleryType) {
      logWarning("No gallery type given. Using default 'Gallery' instead.");
      galleryType = "gallery";
    }

    let url;
    if (!username.endsWith("/")) username += "/";
    switch (galleryType) {
      case "gallery":
        if (!Gallery.hardLink.endsWith("/")) Gallery.hardLink += "/";
        url = Gallery.hardLink + username;
        break;
      case "scraps":
        if (!Scraps.hardLink.endsWith("/")) Scraps.hardLink += "/";
        url = Scraps.hardLink + username;
        break;
      case "favorites":
        if (!Favorites.hardLink.endsWith("/")) Favorites.hardLink += "/";
        url = Favorites.hardLink + username;
        break;
    }
    if (url) return await getHTMLLocal(url + pageNumber, semaphore);
    else return null;
  }

  async function getJournalsSectionsTillPageHandleLocal(username, toPageNumber, action, delay, galleryType, semaphore) {
    if (!toPageNumber || toPageNumber == 0) toPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    const percentId = waitAndCallAction.start();
    const getUserJournalsSectionsTillPage = await getJournalsSectionsTillPageLocal(username, toPageNumber, galleryType, percentId, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsTillPage;
  }

  async function getJournalsSectionsSincePageHandleLocal(username, fromPageNumber, action, delay, galleryType, semaphore) {
    if (!fromPageNumber || fromPageNumber == 0) fromPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserJournalsSectionsSincePage = await getJournalsSectionsSincePageLocal(username, fromPageNumber, galleryType, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsSincePage;
  }

  async function getJournalsSectionsHandleBetweenPagesLocal(username, fromPageNumber, toPageNumber, action, delay, semaphore) {
    if (!fromPageNumber || fromPageNumber == 0) fromPageNumber = 1;
    if (!toPageNumber || toPageNumber == 0) toPageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    const percentId = waitAndCallAction.start();
    const getUserJournalsSectionsBetween = await getJournalsSectionsBetweenPagesLocal(username, fromPageNumber, toPageNumber, percentId, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsBetween;
  }

  async function getJournalsSectionsHandleLocal(username, pageNumber, action, delay, semaphore) {
    if (!pageNumber || pageNumber == 0) pageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, true, delay);
    waitAndCallAction.start();
    const getUserJournalsSections = await getJournalsSectionsLocal(username, pageNumber, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSections;
  }

  async function getJournalsPageHandleLocal(username, pageNumber, action, delay, semaphore) {
    if (!pageNumber || pageNumber == 0) pageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserJournalsPage = await getJournalsPageLocal(username, pageNumber, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsPage;
  }

  async function getJournalsSectionsTillIdHandleLocal(username, toId, fromPage, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserJournalsSectionsTillId = await getJournalsSectionsTillIdLocal(username, toId, fromPage, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsTillId;
  }

  async function getJournalsSectionsSinceIdHandleLocal(username, fromId, toPage, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserJournalsSectionsSinceId = await getJournalsSectionsSinceIdLocal(username, fromId, toPage, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsSinceId;
  }

  async function getJournalsSectionsBetweenIdsHandleLocal(username, fromId, toId, fromPage, toPage, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const getUserJournalsSectionsBetweenIds = await getJournalsSectionsBetweenIdsLocal(username, fromId, toId, fromPage, toPage, semaphore);
    waitAndCallAction.stop();
    return getUserJournalsSectionsBetweenIds;
  }

  async function getJournalsSectionsTillIdLocal(username, toId, fromPage, semaphore) {
    if (toId) {
      logError("No toId given");
      return null;
    }

    let allSections = [];
    let lastSectionId;
    let running = true;
    let i = 1;
    if (fromPage && fromPage >= 1) i = fromPage;
    while (running) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      let currSectionId = lastSectionId;
      if (sections && sections.length !== 0) currSectionId = sections[0].id;
      if (currSectionId == lastSectionId) running = false;
      else {
        if (idArrayContainsId(sections, toId)) {
          allSections.push(getIdArrayTillId(sections, toId));
          running = false;
        } else {
          allSections.push(sections);
          i++;
        }
      }
    }

    if (allSections.length === 0) return null;
    else return allSections;
  }

  async function getJournalsSectionsSinceIdLocal(username, fromId, toPage, semaphore) {
    if (!fromId) {
      logError("No fromId given");
      return null;
    }

    let lastSectionId;
    let running = true;
    let i = 1;
    while (running) {
      if (toPage && toPage >= 1 && i == toPage) {
        running = false;
        break;
      }
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      let currSectionId = lastSectionId;
      if (sections && sections.length !== 0) currSectionId = sections[0].id;
      if (currSectionId == lastSectionId) running = false;
      else {
        if (idArrayContainsId(sections, fromId)) running = false;
        else i++;
      }
    }

    let allSections = [];
    lastSectionId = null;
    running = true;
    while (running) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      let currSectionId = lastSectionId;
      if (sections && sections.length !== 0) currSectionId = sections[0].id;
      if (currSectionId == lastSectionId) running = false;
      else {
        allSections.push(getIdArraySinceId(sections, fromId));
        i++;
      }
    }

    if (allSections.length === 0) return null;
    else return allSections;
  }

  async function getJournalsSectionsBetweenIdsLocal(username, fromId, toId, fromPage, toPage, percentId, semaphore) {
    if (!fromId) {
      logError("No fromId given");
      return null;
    }
    if (!toId) {
      logError("No toId given");
      return null;
    }
    if (!fromPage || fromPage <= 0 || !toPage || toPage <= 1) {
      logWarning("No fromPage or toPage given. Percentages can not be calculated.");
      percentId = null;
    }

    let lastSectionId;
    let running = true;
    let i = 1;
    if (fromPage && fromPage >= 1) i = fromPage;
    while (running) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      let currSectionId = lastSectionId;
      if (sections && sections.length !== 0) currSectionId = sections[0].id;
      if (currSectionId == lastSectionId) running = false;
      else {
        if (idArrayContainsId(sections, fromId)) running = false;
        else i++;
      }
    }

    let allSections = [];
    lastSectionId = null;
    running = true;
    let completedPages = 0;
    while (running) {
      if (toPage && toPage >= 1 && i == toPage) {
        running = false;
        break;
      }
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      let currFigureId = lastSectionId;
      if (sections && sections.length !== 0) currFigureId = sections[0].id;
      if (currFigureId == lastSectionId) running = false;
      else {
        if (idArrayContainsId(sections, toId)) {
          allSections.push(getIdArrayBetweenIds(sections, fromId, toId));
          running = false;
        } else {
          allSections.push(sections);
          i++;
        }
      }
    }

    completedPages++;
    if (percentId) {
      const progress = (completedPages / toPage) * 100;
      PercentHelper.setPercentValue(percentId, progress);
    }
  }

  async function getJournalsSectionsTillPageLocal(username, toPageNumber, percentId, semaphore) {
    if (!toPageNumber) {
      logError("No toPageNumber given");
      return null;
    } else if (toPageNumber <= 0) {
      logError("toPageNumber must be greater than 0");
      return null;
    }

    let allSections = [];
    let completedPages = 0;
    for (let i = 1; i <= toPageNumber; i++) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      if (sections && sections.length !== 0) allSections.push(sections);

      completedPages++;
      if (percentId) {
        const progress = (completedPages / toPageNumber) * 100;
        PercentHelper.setPercentValue(percentId, progress);
      }
    }

    if (allSections.length === 0) return null;
    else return allSections;
  }

  async function getJournalsSectionsSincePageLocal(username, fromPageNumber, semaphore) {
    if (!fromPageNumber) {
      logError("No fromPageNumber given");
      return null;
    } else if (fromPageNumber <= 0) {
      logError("fromPageNumber must be greater than 0");
      return null;
    }

    let allSections = [];
    let lastSectionId;
    let running = true;
    let i = fromPageNumber;
    while (running) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      if (sections && sections.length !== 0) {
        const currSectionId = sections[0].id;
        if (currSectionId == lastSectionId) running = false;
        else {
          allSections.push(sections);
          i++;
        }
      }
    }

    if (allSections.length === 0) return null;
    else return allSections;
  }

  async function getJournalsSectionsBetweenPagesLocal(username, fromPageNumber, toPageNumber, percentId, semaphore) {
    if (!fromPageNumber) {
      logError("No fromPageNumber given");
      return null;
    } else if (fromPageNumber <= 0) {
      logError("fromPageNumber must be greater than 0");
      return null;
    }
    if (!toPageNumber) {
      logError("No toPageNumber given");
      return null;
    } else if (toPageNumber <= 0) {
      logError("toPageNumber must be greater than 0");
      return null;
    }

    let allSections = [];
    let direction = fromPageNumber < toPageNumber ? 1 : -1;
    const totalPages = Math.abs(toPageNumber - fromPageNumber) + 1;
    let completedPages = 0;
    for (let i = fromPageNumber; i <= toPageNumber; i += direction) {
      const sections = await getJournalsSectionsLocal(username, i, semaphore);
      if (sections) allSections.push(sections);

      completedPages++;
      const progress = (completedPages / totalPages) * 100;
      PercentHelper.setPercentValue(percentId, progress);
    }

    if (allSections.length === 0) return null;
    else return allSections;
  }

  async function getJournalsSectionsLocal(username, pageNumber, semaphore) {
    const galleryDoc = await getJournalsPageLocal(username, pageNumber, semaphore);
    if (!galleryDoc) {
      logMessage(`No journals found at "${username}" on page "${pageNumber}".`);
      return null;
    }

    const columnPage = galleryDoc.getElementById("columnpage");
    if (!columnPage) {
      logMessage(`No column page found at "${username}" on page "${pageNumber}".`);
      return null;
    }
    const sections = columnPage.getElementsByTagName("section");
    if (!sections || sections.length === 0) {
      logMessage(`No journals found at "${username}" on page "${pageNumber}".`);
      return null;
    }

    return sections;
  }

  async function getJournalsPageLocal(username, pageNumber, semaphore) {
    if (!username) {
      logError("No username given");
      return null;
    }
    if (!pageNumber) {
      logError("No page number given");
      return null;
    } else if (pageNumber <= 0) {
      logError("Page number must be greater than 0");
      return null;
    }

    if (!username.endsWith("/")) username += "/";
    if (!Journals.hardLink.endsWith("/")) Journals.hardLink += "/";
    const url = Journals.hardLink + username;

    if (url) return await getHTMLLocal(url + pageNumber, semaphore);
    else return null;
  }
  //#endregion

  //#region Personal User Requests
  class PersonalUserRequests {
    constructor(semaphore) {
      this.semaphore = semaphore;
      this.MessageRequests = new MessageRequests(semaphore);
      this.AccountInformation = new AccountInformation(semaphore);
      this.UserProfile = new UserProfile(semaphore);
      this.ManageContent = new ManageContent(semaphore);
      this.Security = new Security(semaphore);
    }
  }
  //#endregion

  //#region Message Requests
  class MessageRequests {
    constructor(semaphore) {
      this.semaphore = semaphore;
      this.NewSubmissions = new NewSubmissions(semaphore);
    }

    static hardActions = {
      remove: "remove_checked",
      nuke: "nuke_notifications",
    };
  }

  class NewSubmissions {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLink = FuraffinityRequestHelper.getUrl() + "/msg/submissions/";

    async getSubmissionsPage(firstSubmissionId, action, delay = 100) {
      return await getNewSubmissionsSubmissionsPageHandleLocal(firstSubmissionId, action, delay, this.semaphore);
    }

    async removeSubmissions(submissionIds, action, delay = 100) {
      return await removeNewSubmissionsSubmissionsHandleLocal(submissionIds, action, delay, this.semaphore);
    }

    async nukeSubmissions(action, delay = 100) {
      return await nukeNewSubmissionsSubmissionsHandleLocal(action, delay, this.semaphore);
    }
  }

  async function getNewSubmissionsSubmissionsPageHandleLocal(firstSubmissionId, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getNewSubmissionsSubmissionsPageLocal(firstSubmissionId, semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getNewSubmissionsSubmissionsPageLocal(firstSubmissionId, semaphore) {
    if (!NewSubmissions.hardLink.endsWith("/")) NewSubmissions.hardLink += "/";

    if (firstSubmissionId) return await getHTMLLocal(`${NewSubmissions.hardLink}new~${firstSubmissionId}@72/`, semaphore);
    else return await getHTMLLocal(`${NewSubmissions.hardLink}new@72/`, semaphore);
  }

  async function removeNewSubmissionsSubmissionsHandleLocal(submissionIds, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await removeNewSubmissionsSubmissionsLocal(submissionIds, semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function removeNewSubmissionsSubmissionsLocal(submissionIds, semaphore) {
    if (!NewSubmissions.hardLink.endsWith("/")) NewSubmissions.hardLink += "/";

    if (!submissionIds || submissionIds.length == 0) {
      logWarning("No submission ids to remove");
      return;
    }

    const payload = [];
    for (const submissionId of submissionIds) {
      payload.push({ key: "submissions[]", value: submissionId });
    }
    payload.push({ key: "messagecenter-action", value: MessageRequests.hardActions["remove"] });

    return await sendHttpPostLocal(`${NewSubmissions.hardLink}new@72/`, payload, semaphore);
  }

  async function nukeNewSubmissionsSubmissionsHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await nukeNewSubmissionsSubmissionsLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function nukeNewSubmissionsSubmissionsLocal(semaphore) {
    if (!NewSubmissions.hardLink.endsWith("/")) NewSubmissions.hardLink += "/";

    const payload = [];
    payload.push({ key: "messagecenter-action", value: MessageRequests.hardActions["nuke"] });

    return await sendHttpPostLocal(`${NewSubmissions.hardLink}new@72/`, payload, semaphore);
  }
  //#endregion

  //#region Account Information Requests
  class AccountInformation {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLinks = {
      settings: FuraffinityRequestHelper.getUrl() + "/controls/settings/",
      siteSettings: FuraffinityRequestHelper.getUrl() + "/controls/site-settings/",
      userSettings: FuraffinityRequestHelper.getUrl() + "/controls/user-settings/",
    };

    async getSettingsPage(action, delay = 100) {
      return await getAccountInformationSettingsPageHandleLocal(action, delay, this.semaphore);
    }

    async getSiteSettingsPage(action, delay = 100) {
      return await getAccountInformationSiteSettingsPageHandleLocal(action, delay, this.semaphore);
    }

    async getUserSettingsPage(action, delay = 100) {
      return await getAccountInformationUserSettingsPageHandleLocal(action, delay, this.semaphore);
    }
  }

  async function getAccountInformationSettingsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getAccountInformationSettingsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getAccountInformationSiteSettingsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getAccountInformationSiteSettingsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getAccountInformationUserSettingsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getAccountInformationUserSettingsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getAccountInformationSettingsPageLocal(semaphore) {
    if (!AccountInformation.hardLinks["settings"].endsWith("/")) AccountInformation.hardLinks["settings"] += "/";
    return await getHTMLLocal(AccountInformation.hardLinks["settings"], semaphore);
  }

  async function getAccountInformationSiteSettingsPageLocal(semaphore) {
    if (!AccountInformation.hardLinks["siteSettings"].endsWith("/")) AccountInformation.hardLinks["siteSettings"] += "/";
    return await getHTMLLocal(AccountInformation.hardLinks["siteSettings"], semaphore);
  }

  async function getAccountInformationUserSettingsPageLocal(semaphore) {
    if (!AccountInformation.hardLinks["userSettings"].endsWith("/")) AccountInformation.hardLinks["userSettings"] += "/";
    return await getHTMLLocal(AccountInformation.hardLinks["userSettings"], semaphore);
  }
  //#endregion

  //#region User Profile Requests
  class UserProfile {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLinks = {
      profile: FuraffinityRequestHelper.getUrl() + "/controls/profile/",
      profilebanner: FuraffinityRequestHelper.getUrl() + "/controls/profilebanner/",
      contacts: FuraffinityRequestHelper.getUrl() + "/controls/contacts/",
      avatar: FuraffinityRequestHelper.getUrl() + "/controls/avatar/",
    };

    async getProfilePage(action, delay = 100) {
      return await getUserProfileProfilePageHandleLocal(action, delay, this.semaphore);
    }

    async getProfilebannerPage(action, delay = 100) {
      return await getUserProfileProfilebannerPageHandleLocal(action, delay, this.semaphore);
    }

    async getContactsPage(action, delay = 100) {
      return await getUserProfileContactsPageHandleLocal(action, delay, this.semaphore);
    }

    async getAvatarPage(action, delay = 100) {
      return await getUserProfileAvatarPageHandleLocal(action, delay, this.semaphore);
    }
  }

  async function getUserProfileProfilePageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getUserProfileProfilePageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getUserProfileProfilebannerPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getUserProfileProfilebannerPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getUserProfileContactsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getUserProfileContactsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getUserProfileAvatarPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getUserProfileAvatarPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getUserProfileProfilePageLocal(semaphore) {
    if (!UserProfile.hardLinks["profile"].endsWith("/")) UserProfile.hardLinks["profile"] += "/";
    return await getHTMLLocal(UserProfile.hardLinks["profile"], semaphore);
  }

  async function getUserProfileProfilebannerPageLocal(semaphore) {
    if (!UserProfile.hardLinks["profilebanner"].endsWith("/")) UserProfile.hardLinks["profilebanner"] += "/";
    return await getHTMLLocal(UserProfile.hardLinks["profilebanner"], semaphore);
  }

  async function getUserProfileContactsPageLocal(semaphore) {
    if (!UserProfile.hardLinks["contacts"].endsWith("/")) UserProfile.hardLinks["contacts"] += "/";
    return await getHTMLLocal(UserProfile.hardLinks["contacts"], semaphore);
  }

  async function getUserProfileAvatarPageLocal(semaphore) {
    if (!UserProfile.hardLinks["avatar"].endsWith("/")) UserProfile.hardLinks["avatar"] += "/";
    return await getHTMLLocal(UserProfile.hardLinks["avatar"], semaphore);
  }

  //#endregion

  //#region Manage Content Requests
  class ManageContent {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLinks = {
      submissions: FuraffinityRequestHelper.getUrl() + "/controls/submissions/",
      folders: FuraffinityRequestHelper.getUrl() + "/controls/folders/submissions/",
      journals: FuraffinityRequestHelper.getUrl() + "/controls/journal/",
      favorites: FuraffinityRequestHelper.getUrl() + "/controls/favorites/",
      buddylist: FuraffinityRequestHelper.getUrl() + "/controls/buddylist/",
      shouts: FuraffinityRequestHelper.getUrl() + "/controls/shouts/",
      badges: FuraffinityRequestHelper.getUrl() + "/controls/badges/",
    };

    async getFoldersPages(action, delay = 100) {
      return await getContentFoldersHandleLocal(action, delay, this.semaphore);
    }

    async getAllWatchesPages(action, delay = 100) {
      return await getContentAllWatchesPagesHandleLocal(action, delay, this.semaphore);
    }

    async getWatchesPage(pageNumber, action, delay = 100) {
      return await getWatchesPageHandleLocal(pageNumber, action, delay, this.semaphore);
    }
  }

  async function getContentFoldersHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getContentFoldersLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getContentFoldersLocal(semaphore) {
    if (!ManageContent.hardLinks["folders"].endsWith("/")) ManageContent.hardLinks["folders"] += "/";
    return await getHTMLLocal(ManageContent.hardLinks["folders"], semaphore);
  }

  async function getContentAllWatchesPagesHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const getAllWatches = await getContentAllWatchesPagesLocal(semaphore);
    waitAndCallAction.stop();
    return getAllWatches;
  }

  async function getContentAllWatchesPagesLocal(semaphore) {
    if (!ManageContent.hardLinks["buddylist"].endsWith("/")) ManageContent.hardLinks["buddylist"] += "/";
    let usersDoc = await getHTMLLocal(ManageContent.hardLinks["buddylist"] + "x", semaphore);
    const columnPage = usersDoc.getElementById("columnpage");
    const sectionBody = columnPage.querySelector('div[class="section-body"');
    const pages = sectionBody.querySelectorAll(":scope > a");
    let userPageDocs = [];
    for (let i = 1; i <= pages.length; i++) {
      usersDoc = await getWatchesPageLocal(i, semaphore);
      if (usersDoc) userPageDocs.push(usersDoc);
    }

    if (userPageDocs.length == 0) return null;
    else return userPageDocs;
  }

  async function getWatchesPageHandleLocal(pageNumber, action, delay, semaphore) {
    if (!pageNumber || pageNumber == 0) pageNumber = 1;
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const getWatchesPage = await getWatchesPageLocal(pageNumber, semaphore);
    waitAndCallAction.stop();
    return getWatchesPage;
  }

  async function getWatchesPageLocal(pageNumber, semaphore) {
    if (!pageNumber) {
      logError("No page number given");
      return null;
    } else if (pageNumber <= 0) {
      logError("pageNumber must be greater than 0");
      return null;
    }

    if (!ManageContent.hardLinks["buddylist"].endsWith("/")) ManageContent.hardLinks["buddylist"] += "/";
    const usersDoc = await getHTMLLocal(ManageContent.hardLinks["buddylist"] + pageNumber, semaphore);
    return usersDoc;
  }
  //#endregion

  //#region Security Requests
  class Security {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLinks = {
      sessions: FuraffinityRequestHelper.getUrl() + "/controls/sessions/logins/",
      logs: FuraffinityRequestHelper.getUrl() + "/controls/logs/",
      labels: FuraffinityRequestHelper.getUrl() + "/controls/labels/",
    };

    async getSessionsPage(action, delay = 100) {
      return await getSecuritySessionsPageHandleLocal(action, delay, this.semaphore);
    }

    async getLogsPage(action, delay = 100) {
      return await getSecurityLogsPageHandleLocal(action, delay, this.semaphore);
    }

    async getLabelsPage(action, delay = 100) {
      return await getSecurityLabelsPageHandleLocal(action, delay, this.semaphore);
    }
  }

  async function getSecuritySessionsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getSecuritySessionsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getSecurityLogsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getSecurityLogsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getSecurityLabelsPageHandleLocal(action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, delay);
    waitAndCallAction.start();
    const result = await getSecurityLabelsPageLocal(semaphore);
    waitAndCallAction.stop();
    return result;
  }

  async function getSecuritySessionsPageLocal(semaphore) {
    if (!Security.hardLinks["sessions"].endsWith("/")) Security.hardLinks["sessions"] += "/";
    return await getHTMLLocal(Security.hardLinks["sessions"], semaphore);
  }

  async function getSecurityLogsPageLocal(semaphore) {
    if (!Security.hardLinks["logs"].endsWith("/")) Security.hardLinks["logs"] += "/";
    return await getHTMLLocal(Security.hardLinks["logs"], semaphore);
  }

  async function getSecurityLabelsPageLocal(semaphore) {
    if (!Security.hardLinks["labels"].endsWith("/")) Security.hardLinks["labels"] += "/";
    return await getHTMLLocal(Security.hardLinks["labels"], semaphore);
  }

  //#endregion

  //#region Submission Requests
  class SubmissionRequests {
    constructor(semaphore) {
      this.semaphore = semaphore;
    }

    static hardLinks = {
      view: FuraffinityRequestHelper.getUrl() + "/view/",
      fav: FuraffinityRequestHelper.getUrl() + "/fav/",
      unfav: FuraffinityRequestHelper.getUrl() + "/unfav/",
      journal: FuraffinityRequestHelper.getUrl() + "/journal/",
    };

    async getSubmissionPage(submissionId, action, delay = 100) {
      return await getSubmissionPageHandleLocal(submissionId, action, delay, this.semaphore);
    }

    async favSubmission(submissionId, favKey, action, delay = 100) {
      return await favSubmissionHandleLocal(submissionId, favKey, action, delay, this.semaphore);
    }

    async unfavSubmission(submissionId, unfavKey, action, delay = 100) {
      return await unfavSubmissionHandleLocal(submissionId, unfavKey, action, delay, this.semaphore);
    }

    async getJournalPage(journalId, action, delay = 100) {
      return await getJournalPageHandleLocal(journalId, action, delay, this.semaphore);
    }
  }

  async function getSubmissionPageHandleLocal(submissionId, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const submissionPage = await getSubmissionPageLocal(submissionId, semaphore);
    waitAndCallAction.stop();
    return submissionPage;
  }

  async function getSubmissionPageLocal(submissionId, semaphore) {
    if (!submissionId) {
      logError("No submissionId given");
      return null;
    }

    if (!SubmissionRequests.hardLinks["view"].endsWith("/")) SubmissionRequests.hardLinks["view"] += "/";
    const url = SubmissionRequests.hardLinks["view"] + submissionId;

    if (url) return await getHTMLLocal(url, semaphore);
    else return null;
  }

  async function favSubmissionHandleLocal(submissionId, favKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const unfavKey = await favSubmissionLocal(submissionId, favKey, semaphore);
    waitAndCallAction.stop();
    return unfavKey;
  }

  async function favSubmissionLocal(submissionId, favKey, semaphore) {
    if (!submissionId) {
      logError("No submissionId given");
      return null;
    }
    if (!favKey) {
      logError("No favKey given");
      return null;
    }

    if (!SubmissionRequests.hardLinks["fav"].endsWith("/")) SubmissionRequests.hardLinks["fav"] += "/";
    const url = SubmissionRequests.hardLinks["fav"] + submissionId + "?key=" + favKey;

    if (url) {
      const resultDoc = await getHTMLLocal(url, semaphore);
      try {
        const standardpage = resultDoc.getElementById("standardpage");
        if (standardpage) {
          const blocked = standardpage.querySelector('div[class="redirect-message"]');
          if (blocked && blocked.textContent.includes("blocked"))
            return;
        }
        const unfavKey = getFavKey(resultDoc);
        return unfavKey;
      } catch { }
    }
  }

  async function unfavSubmissionHandleLocal(submissionId, unfavKey, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const success = await unfavSubmissionLocal(submissionId, unfavKey, semaphore);
    waitAndCallAction.stop();
    return success;
  }

  async function unfavSubmissionLocal(submissionId, unfavKey, semaphore) {
    if (!submissionId) {
      logError("No submissionId given");
      return null;
    }
    if (!unfavKey) {
      logError("No unfavKey given");
      return null;
    }

    if (!SubmissionRequests.hardLinks["unfav"].endsWith("/")) SubmissionRequests.hardLinks["unfav"] += "/";
    const url = SubmissionRequests.hardLinks["unfav"] + submissionId + "?key=" + unfavKey;

    if (url) {
      const resultDoc = await getHTMLLocal(url, semaphore);
      if (resultDoc) {
        const favKey = getFavKey(resultDoc);
        return favKey;
      }
    }
  }

  async function getJournalPageHandleLocal(journalId, action, delay, semaphore) {
    const waitAndCallAction = new WaitAndCallAction(action, false, delay);
    waitAndCallAction.start();
    const journalPage = await getJournalPageLocal(journalId, semaphore);
    waitAndCallAction.stop();
    return journalPage;
  }

  async function getJournalPageLocal(journalId, semaphore) {
    if (!journalId) {
      logError("No journalId given");
      return null;
    }

    if (!JournalRequests.hardLinks["journal"].endsWith("/")) JournalRequests.hardLinks["journal"] += "/";
    const url = JournalRequests.hardLinks["journal"] + journalId;

    if (url) return await getHTMLLocal(url, semaphore);
    else return null;
  }
  //#endregion

  //#region Utility Functions
  function logMessage(message) {
    if (FuraffinityRequestHelper.logLevel >= 3) console.log(message);
  }
  function logWarning(message) {
    if (FuraffinityRequestHelper.logLevel >= 2) console.warn(message);
  }
  function logError(message) {
    if (FuraffinityRequestHelper.logLevel >= 1) console.error(message);
  }

  function getIdArrayTillId(array, toId) {
    const result = [];
    for (const elem of array) {
      result.push(elem);
      if (elem.id.toString().replace('sid-', '') == toId) break;
    }
    return result;
  }
  function getIdArraySinceId(array, fromId) {
    array.reverse();
    const result = [];
    for (const elem of array) {
      result.push(elem);
      if (elem.id.toString().replace('sid-', '') == fromId) break;
    }
    result.reverse();
    return result;
  }
  function getIdArrayBetweenIds(array, fromId, toId) {
    let startIndex = -1;
    let endIndex = -1;
    for (let i = 0; i < array.length; i++) {
      if (array[i].id.toString().replace('sid-', '') == fromId) startIndex = i;
      if (array[i].id.toString().replace('sid-', '') == toId) endIndex = i;
      if (startIndex != -1 && endIndex != -1) break;
    }

    if (startIndex == -1 && endIndex == -1) return array;

    if (startIndex == -1) startIndex = 0;
    if (endIndex == -1) endIndex = array.length - 1;

    const result = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push(array[i]);
    }

    return result;
  }
  function idArrayContainsId(array, id) {
    for (const elem of array) {
      if (elem.id.toString().replace('sid-', '') == id) return true;
    }
    return false;
  }
  function getFavKey(doc) {
    const columnPage = doc.getElementById("columnpage");
    const navbar = columnPage.querySelector('div[class*="favorite-nav"');
    const buttons = navbar.querySelectorAll('a[class*="button"][href]');
    let favButton;
    for (const button of buttons) {
      if (button.textContent.toLowerCase().includes("fav"))
        favButton = button;
    }

    if (favButton) {
      const favKey = favButton.href.split("?key=")[1];
      return favKey;
    }
  }
  //#endregion
})();
