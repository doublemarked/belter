/* @flow */
/* eslint max-lines: off */

import { ZalgoPromise } from 'zalgo-promise/src';
import { linkFrameWindow, isWindowClosed,
    type SameDomainWindowType, type CrossDomainWindowType } from 'cross-domain-utils/src';
import { WeakMap } from 'cross-domain-safe-weakmap/src';

import { inlineMemoize, noop, stringify, capitalizeFirstLetter,
    once, extend, safeInterval, uniqueID, arrayFrom } from './util';
import { isDevice } from './device';
import { KEY_CODES } from './constants';
import type { CancelableType } from './types';

type ElementRefType = string | HTMLElement;

export function isDocumentReady() : boolean {
    return Boolean(document.body) && document.readyState === 'complete';
}

export function urlEncode(str : string) : string {
    return str.replace(/\?/g, '%3F').replace(/&/g, '%26').replace(/#/g, '%23').replace(/\+/g, '%2B');
}

export function waitForWindowReady() : ZalgoPromise<void> {
    return inlineMemoize(waitForWindowReady, () : ZalgoPromise<void> => {
        return new ZalgoPromise(resolve => {
            if (isDocumentReady()) {
                resolve();
            }

            window.addEventListener('load', () => resolve());
        });
    });
}

export function waitForDocumentReady() : ZalgoPromise<void> {
    return inlineMemoize(waitForDocumentReady, () : ZalgoPromise<void> => {
        return new ZalgoPromise(resolve => {

            if (isDocumentReady()) {
                return resolve();
            }

            let interval = setInterval(() => {
                if (isDocumentReady()) {
                    clearInterval(interval);
                    return resolve();
                }
            }, 10);
        });
    });
}

export function waitForDocumentBody() : ZalgoPromise<HTMLBodyElement> {
    return waitForDocumentReady().then(() => {
        if (document.body) {
            return document.body;
        }

        throw new Error('Document ready but document.body not present');
    });
}

export function parseQuery(queryString : string) : Object {
    return inlineMemoize(parseQuery, () : Object => {
        let params = {};

        if (!queryString) {
            return params;
        }

        if (queryString.indexOf('=') === -1) {
            return params;
        }

        for (let pair of queryString.split('&')) {
            pair = pair.split('=');

            if (pair[0] && pair[1]) {
                params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
            }
        }

        return params;
    }, [ queryString ]);
}


export function getQueryParam(name : string) : string {
    return parseQuery(window.location.search.slice(1))[name];
}

export function urlWillRedirectPage(url : string) : boolean {

    if (url.indexOf('#') === -1) {
        return true;
    }

    if (url.indexOf('#') === 0) {
        return false;
    }

    if (url.split('#')[0] === window.location.href.split('#')[0]) {
        return false;
    }

    return true;
}

export function formatQuery(obj : { [ string ] : string } = {}) : string {

    return Object.keys(obj).filter(key => {
        return typeof obj[key] === 'string';
    }).map(key => {
        return `${ urlEncode(key) }=${ urlEncode(obj[key]) }`;
    }).join('&');
}

export function extendQuery(originalQuery : string, props : { [ string ] : string } = {}) : string {

    if (!props || !Object.keys(props).length) {
        return originalQuery;
    }

    return formatQuery({
        ...parseQuery(originalQuery),
        ...props
    });
}

export function extendUrl(url : string, options : { query? : { [string] : string }, hash? : { [string] : string } } = {}) : string {

    let query = options.query || {};
    let hash = options.hash || {};

    let originalUrl;
    let originalQuery;
    let originalHash;

    [ originalUrl, originalHash ] = url.split('#');
    [ originalUrl, originalQuery ] = originalUrl.split('?');

    let queryString = extendQuery(originalQuery, query);
    let hashString = extendQuery(originalHash, hash);

    if (queryString) {
        originalUrl = `${ originalUrl }?${ queryString }`;
    }

    if (hashString) {
        originalUrl = `${ originalUrl }#${ hashString }`;
    }

    return originalUrl;
}

export function redirect(url : string, win : CrossDomainWindowType = window) : ZalgoPromise<void> {
    return new ZalgoPromise(resolve => {
        win.location = url;
        if (!urlWillRedirectPage(url)) {
            resolve();
        }
    });
}

export function hasMetaViewPort() : boolean {
    let meta = document.querySelector('meta[name=viewport]');

    if (isDevice() && window.screen.width < 660 && !meta) {
        return false;
    }

    return true;
}

export function isElementVisible(el : HTMLElement) : boolean {
    return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

export function enablePerformance() : boolean {
    return inlineMemoize(enablePerformance, () : boolean => {
        /* eslint-disable compat/compat */
        return Boolean(
            window.performance &&
            performance.now &&
            performance.timing &&
            performance.timing.connectEnd &&
            performance.timing.navigationStart &&
            (Math.abs(performance.now() - Date.now()) > 1000) &&
            (performance.now() - (performance.timing.connectEnd - performance.timing.navigationStart)) > 0
        );
        /* eslint-enable compat/compat */
    });
}

export function getPageRenderTime() : ZalgoPromise<?number> {
    return waitForDocumentReady().then(() => {

        if (!enablePerformance()) {
            return;
        }

        let timing = window.performance.timing;

        if (timing.connectEnd && timing.domInteractive) {
            return timing.domInteractive - timing.connectEnd;
        }
    });
}

export function htmlEncode(html : string = '') : string {
    return html.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\//g, '&#x2F;');
}

export function isBrowser() : boolean {
    return (typeof window !== 'undefined');
}

export function querySelectorAll(selector : string, doc : HTMLElement = window.document) : Array<HTMLElement> {
    return Array.prototype.slice.call(doc.querySelectorAll(selector));
}

export function onClick(element : HTMLElement, handler : (Event) => void) {
    element.addEventListener('touchstart', noop);
    element.addEventListener('click', handler);
    element.addEventListener('keypress', (event : Event) => {
        // $FlowFixMe
        if (event.keyCode === KEY_CODES.ENTER) {
            return handler(event);
        }
    });
}

export function getScript({ host = window.location.host, path } : { host? : string, path : string }) : ?HTMLScriptElement {
    return inlineMemoize(getScript, () : ?HTMLScriptElement => {

        let url = `${ host }${ path }`;
        let scripts = Array.prototype.slice.call(document.getElementsByTagName('script'));

        for (let script of scripts) {
            if (!script.src) {
                continue;
            }

            let src = script.src.replace(/^https?:\/\//, '').split('?')[0];

            if (src === url) {
                return script;
            }
        }
    }, [ path ]);
}

export function isLocalStorageEnabled() : boolean {
    return inlineMemoize(isLocalStorageEnabled, () => {
        try {
            if (typeof window === 'undefined') {
                return false;
            }

            if (window.localStorage) {
                let value = Math.random().toString();
                window.localStorage.setItem('__test__localStorage__', value);
                let result = window.localStorage.getItem('__test__localStorage__');
                window.localStorage.removeItem('__test__localStorage__');
                if (value === result) {
                    return true;
                }
            }
        } catch (err) {
            // pass
        }
        return false;
    });
}

export function getBrowserLocales() : Array<{ country? : string, lang : string }> {
    let nav = window.navigator;

    let locales = nav.languages
        ? Array.prototype.slice.apply(nav.languages)
        : [];

    if (nav.language) {
        locales.push(nav.language);
    }

    if (nav.userLanguage) {
        locales.push(nav.userLanguage);
    }

    return locales.map(locale => {

        if (locale && locale.match(/^[a-z]{2}[-_][A-Z]{2}$/)) {
            let [ lang, country ] = locale.split(/[-_]/);
            return { country, lang };
        }

        if (locale && locale.match(/^[a-z]{2}$/)) {
            return { lang: locale };
        }

        return null;

    }).filter(Boolean);
}


export function appendChild(container : HTMLElement, child : HTMLElement | Text) {
    container.appendChild(child);
}

export function isElement(element : mixed) : boolean {

    if (element instanceof window.Element) {
        return true;
    }

    if (element !== null && typeof element === 'object' && element.nodeType === 1 && typeof element.style === 'object' && typeof element.ownerDocument === 'object') {
        return true;
    }

    return false;
}

export function getElementSafe(id : ElementRefType, doc : Document | HTMLElement = document) : ?HTMLElement {

    if (isElement(id)) {
        // $FlowFixMe
        return id;
    }

    if (typeof id === 'string') {
        return doc.querySelector(id);
    }
}

export function getElement(id : ElementRefType, doc : Document | HTMLElement = document) : HTMLElement {

    let element = getElementSafe(id, doc);

    if (element) {
        return element;
    }

    throw new Error(`Can not find element: ${ stringify(id) }`);
}

export function elementReady(id : ElementRefType) : ZalgoPromise<window.HTMLElement> {
    return new ZalgoPromise((resolve, reject) => {

        let name = stringify(id);
        let el = getElementSafe(id);

        if (el) {
            return resolve(el);
        }

        if (isDocumentReady()) {
            return reject(new Error(`Document is ready and element ${ name } does not exist`));
        }

        let interval = setInterval(() => {

            el = getElementSafe(id);

            if (el) {
                clearInterval(interval);
                return resolve(el);
            }

            if (isDocumentReady()) {
                clearInterval(interval);
                return reject(new Error(`Document is ready and element ${ name } does not exist`));
            }
        }, 10);
    });
}

export function PopupOpenError(message : string) {
    this.message = message;
}

PopupOpenError.prototype = Object.create(Error.prototype);

type PopupOptions = {|
    name? : string,
    width? : number,
    height? : number,
    top? : number,
    left? : number,
    status? : 0 | 1,
    resizable? : 0 | 1,
    toolbar? : 0 | 1,
    menubar? : 0 | 1,
    scrollbars? : 0 | 1
|};

export function popup(url : string, options? : PopupOptions) : CrossDomainWindowType {

    // $FlowFixMe
    options = options || {};

    let { width, height } = options;

    let top = 0;
    let left = 0;

    if (width) {
        if (window.outerWidth) {
            left = Math.round((window.outerWidth - width) / 2) + window.screenX;
        } else if (window.screen.width) {
            left = Math.round((window.screen.width - width) / 2);
        }
    }

    if (height) {
        if (window.outerHeight) {
            top = Math.round((window.outerHeight - height) / 2) + window.screenY;
        } else if (window.screen.height) {
            top = Math.round((window.screen.height - height) / 2);
        }
    }

    options = {
        top,
        left,
        width,
        height,
        status:     1,
        toolbar:    0,
        menubar:    0,
        resizable:  1,
        scrollbars: 1,
        ...options
    };

    let name = options.name || '';
    delete options.name;

    // eslint-disable-next-line array-callback-return
    let params = Object.keys(options).map(key => {
        // $FlowFixMe
        if (options[key]) {
            return `${ key }=${ stringify(options[key]) }`;
        }
    }).filter(Boolean).join(',');

    let win;

    try {
        win = window.open(url, name, params, true);
    } catch (err) {
        throw new PopupOpenError(`Can not open popup window - ${ err.stack || err.message }`);
    }

    if (isWindowClosed(win)) {
        let err = new PopupOpenError(`Can not open popup window - blocked`);
        throw err;
    }

    window.addEventListener('unload', () => win.close());

    return win;
}


export function writeToWindow(win : SameDomainWindowType, html : string) {
    try {
        win.document.open();
        win.document.write(html);
        win.document.close();
    } catch (err) {
        try {
            win.location = `javascript: document.open(); document.write(${ JSON.stringify(html) }); document.close();`;
        } catch (err2) {
            // pass
        }
    }
}

export function writeElementToWindow(win : SameDomainWindowType, el : HTMLElement) {

    let tag = el.tagName.toLowerCase();

    if (tag !== 'html') {
        throw new Error(`Expected element to be html, got ${ tag }`);
    }

    let documentElement = win.document.documentElement;

    for (const child of arrayFrom(documentElement.children)) {
        documentElement.removeChild(child);
    }

    for (const child of arrayFrom(el.children)) {
        documentElement.appendChild(child);
    }
}

export function setStyle(el : HTMLElement, styleText : string, doc : Document = window.document) {
    // $FlowFixMe
    if (el.styleSheet) {
        // $FlowFixMe
        el.styleSheet.cssText = styleText;
    } else {
        el.appendChild(doc.createTextNode(styleText));
    }
}

export type ElementOptionsType = {
    style? : { [ string ] : string },
    id? : string,
    class? : ?Array<string>,
    attributes? : { [ string ] : string },
    styleSheet? : ?string,
    html? : ?string
};

let awaitFrameLoadPromises : WeakMap<HTMLIFrameElement, ZalgoPromise<HTMLIFrameElement>>;

export function awaitFrameLoad(frame : HTMLIFrameElement) : ZalgoPromise<HTMLIFrameElement> {
    awaitFrameLoadPromises = awaitFrameLoadPromises || new WeakMap();

    if (awaitFrameLoadPromises.has(frame)) {
        let promise = awaitFrameLoadPromises.get(frame);
        if (promise) {
            return promise;
        }
    }

    let promise = new ZalgoPromise((resolve, reject) => {
        frame.addEventListener('load', () => {
            linkFrameWindow(frame);
            resolve(frame);
        });

        frame.addEventListener('error', (err : Event) => {
            if (frame.contentWindow) {
                resolve(frame);
            } else {
                reject(err);
            }
        });
    });

    awaitFrameLoadPromises.set(frame, promise);

    return promise;
}

export function awaitFrameWindow(frame : HTMLIFrameElement) : ZalgoPromise<CrossDomainWindowType> {
    return awaitFrameLoad(frame).then(loadedFrame => {

        if (!loadedFrame.contentWindow) {
            throw new Error(`Could not find window in iframe`);
        }

        return loadedFrame.contentWindow;
    });
}

export function createElement(tag : string = 'div', options : ElementOptionsType = {}, container : ?HTMLElement) : HTMLElement {

    tag = tag.toLowerCase();
    let element = document.createElement(tag);

    if (options.style) {
        extend(element.style, options.style);
    }

    if (options.class) {
        element.className = options.class.join(' ');
    }

    if (options.id) {
        element.setAttribute('id', options.id);
    }

    if (options.attributes) {
        for (let key of Object.keys(options.attributes)) {
            element.setAttribute(key, options.attributes[key]);
        }
    }

    if (options.styleSheet) {
        setStyle(element, options.styleSheet);
    }

    if (container) {
        appendChild(container, element);
    }

    if (options.html) {
        if (tag === 'iframe') {
            // $FlowFixMe
            if (!container || !element.contentWindow) {
                throw new Error(`Iframe html can not be written unless container provided and iframe in DOM`);
            }

            // $FlowFixMe
            writeToWindow(element.contentWindow, options.html);

        } else {
            element.innerHTML = options.html;
        }
    }

    return element;
}


export type IframeElementOptionsType = {
    style? : { [ string ] : string },
    class? : ?Array<string>,
    attributes? : { [ string ] : string },
    styleSheet? : ?string,
    html? : ?string,
    url? : ?string
};

export function iframe(options : IframeElementOptionsType = {}, container : ?HTMLElement) : HTMLIFrameElement {

    let attributes = options.attributes || {};
    let style = options.style || {};

    let frame = createElement('iframe', {
        attributes: {
            allowTransparency: 'true',
            ...attributes
        },
        style: {
            backgroundColor: 'transparent',
            border:          'none',
            ...style
        },
        html:  options.html,
        class: options.class
    });

    const isIE = window.navigator.userAgent.match(/MSIE|Edge/i);
    
    if (!frame.hasAttribute('id')) {
        frame.setAttribute('id', uniqueID());
    }

    // $FlowFixMe
    awaitFrameLoad(frame);

    if (container) {
        let el = getElement(container);
        el.appendChild(frame);
    }

    if (options.url || isIE) {
        frame.setAttribute('src', options.url || 'about:blank');
    }

    // $FlowFixMe
    return frame;
}

export function addEventListener(obj : HTMLElement, event : string, handler : (event : Event) => void) : CancelableType {
    obj.addEventListener(event, handler);
    return {
        cancel() {
            obj.removeEventListener(event, handler);
        }
    };
}

export function bindEvents(element : HTMLElement, eventNames : Array<string>, handler : (event : Event) => void) : CancelableType {

    handler = once(handler);

    for (let eventName of eventNames) {
        element.addEventListener(eventName, handler);
    }

    return {
        cancel: once(() => {
            for (let eventName of eventNames) {
                element.removeEventListener(eventName, handler);
            }
        })
    };
}

const VENDOR_PREFIXES = [ 'webkit', 'moz', 'ms', 'o' ];

export function setVendorCSS(element : HTMLElement, name : string, value : string) {

    // $FlowFixMe
    element.style[name] = value;

    let capitalizedName = capitalizeFirstLetter(name);

    for (let prefix of VENDOR_PREFIXES) {
        // $FlowFixMe
        element.style[`${ prefix }${ capitalizedName }`] = value;
    }
}

const ANIMATION_START_EVENTS = [ 'animationstart', 'webkitAnimationStart', 'oAnimationStart', 'MSAnimationStart' ];
const ANIMATION_END_EVENTS   = [ 'animationend', 'webkitAnimationEnd', 'oAnimationEnd', 'MSAnimationEnd' ];

export function animate(element : ElementRefType, name : string, clean : (Function) => void, timeout : number = 1000) : ZalgoPromise<void> {
    return new ZalgoPromise((resolve, reject) => {

        let el = getElement(element);

        if (!el) {
            return resolve();
        }

        let hasStarted = false;

        let startTimeout;
        let endTimeout;
        let startEvent;
        let endEvent;

        function cleanUp() {
            clearTimeout(startTimeout);
            clearTimeout(endTimeout);
            startEvent.cancel();
            endEvent.cancel();
        }

        startEvent = bindEvents(el, ANIMATION_START_EVENTS, event => {

            // $FlowFixMe
            if (event.target !== el || event.animationName !== name) {
                return;
            }

            clearTimeout(startTimeout);

            event.stopPropagation();

            startEvent.cancel();
            hasStarted = true;

            endTimeout = setTimeout(() => {
                cleanUp();
                resolve();
            }, timeout);
        });

        endEvent = bindEvents(el, ANIMATION_END_EVENTS, event => {

            // $FlowFixMe
            if (event.target !== el || event.animationName !== name) {
                return;
            }

            cleanUp();

            // $FlowFixMe
            if (typeof event.animationName === 'string' && event.animationName !== name) {
                return reject(`Expected animation name to be ${ name }, found ${ event.animationName }`);
            }

            return resolve();
        });

        setVendorCSS(el, 'animationName', name);

        startTimeout = setTimeout(() => {
            if (!hasStarted) {
                cleanUp();
                return resolve();
            }
        }, 200);

        if (clean) {
            clean(cleanUp);
        }
    });
}

const STYLE = {

    DISPLAY: {
        NONE:  'none',
        BLOCK: 'block'
    },

    VISIBILITY: {
        VISIBLE: 'visible',
        HIDDEN:  'hidden'
    },

    IMPORTANT: 'important'
};

export function makeElementVisible(element : HTMLElement) {
    element.style.setProperty('visibility', '');
}

export function makeElementInvisible(element : HTMLElement) {
    element.style.setProperty('visibility', STYLE.VISIBILITY.HIDDEN, STYLE.IMPORTANT);
}


export function showElement(element : HTMLElement) {
    element.style.setProperty('display', '');
}

export function hideElement(element : HTMLElement) {
    element.style.setProperty('display', STYLE.DISPLAY.NONE, STYLE.IMPORTANT);
}

export function destroyElement(element : HTMLElement) {
    if (element && element.parentNode) {
        element.parentNode.removeChild(element);
    }
}

export function showAndAnimate(element : HTMLElement, name : string, clean : (Function) => void) : ZalgoPromise<void> {
    let animation = animate(element, name, clean);
    showElement(element);
    return animation;
}

export function animateAndHide(element : HTMLElement, name : string, clean : (Function) => void) : ZalgoPromise<void> {
    return animate(element, name, clean).then(() => {
        hideElement(element);
    });
}

export function addClass(element : HTMLElement, name : string) {
    element.classList.add(name);
}

export function removeClass(element : HTMLElement, name : string) {
    element.classList.remove(name);
}

export function isElementClosed(el : HTMLElement) : boolean {
    if (!el || !el.parentNode) {
        return true;
    }
    return false;
}

export function watchElementForClose(element : HTMLElement, handler : () => mixed) : CancelableType {
    handler = once(handler);

    let interval;

    if (isElementClosed(element)) {
        handler();
    } else {
        interval = safeInterval(() => {
            if (isElementClosed(element)) {
                interval.cancel();
                handler();
            }
        }, 50);
    }

    return {
        cancel() {
            if (interval) {
                interval.cancel();
            }
        }
    };
}

export function fixScripts(el : HTMLElement, doc : Document = window.document) {
    for (let script of querySelectorAll('script', el)) {
        let parentNode = script.parentNode;

        if (!parentNode) {
            continue;
        }

        let newScript = doc.createElement('script');
        newScript.text = script.textContent;
        parentNode.replaceChild(newScript, script);
    }
}

type OnResizeOptions = {|
    width? : boolean,
    height? : boolean,
    interval? : number,
    win? : SameDomainWindowType
|};

export function onResize(el : HTMLElement, handler : ({ width : number, height : number }) => void, { width = true, height = true, interval = 100, win = window } : OnResizeOptions = {}) : {} {
    let currentWidth = el.offsetWidth;
    let currentHeight = el.offsetHeight;

    handler({ width: currentWidth, height: currentHeight });

    let check = () => {
        let newWidth = el.offsetWidth;
        let newHeight = el.offsetHeight;

        if ((width && newWidth !== currentWidth) || (height && newHeight !== currentHeight)) {
            handler({ width: newWidth, height: newHeight });
        }

        currentWidth = newWidth;
        currentHeight = newHeight;
    };

    let observer;
    let timeout;

    if (typeof win.ResizeObserver !== 'undefined') {
        observer = new win.ResizeObserver(check);
        observer.observe(el);

    } else if (typeof win.MutationObserver !== 'undefined') {
        observer = new win.MutationObserver(check);
        observer.observe(el, {
            attributes:    true,
            childList:     true,
            subtree:       true,
            characterData: false
        });
        win.addEventListener('resize', check);
    } else {
        let loop = () => {
            check();
            timeout = setTimeout(loop, interval);
        };
        loop();
    }

    return {
        cancel: () => {
            observer.disconnect();
            window.removeEventListener('resize', check);
            clearTimeout(timeout);
        }
    };
}

export function getResourceLoadTime(url : string) : ?number {

    if (!enablePerformance()) {
        return;
    }

    if (!window.performance || typeof window.performance.getEntries !== 'function') {
        return;
    }

    const entries = window.performance.getEntries();

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        if (entry && entry.name && entry.name.indexOf(url) === 0 && typeof entry.duration === 'number') {
            return Math.floor(entry.duration);
        }
    }
}
