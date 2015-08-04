
// ==UserScript==
// @name            BetaBoards
// @description     It's just like IRC now
// @version         0.7.2
// @include         http*://*.zetaboards.com/*
// @author          Shou
// @copyright       2015, Shou
// @license         MIT
// @updateURL       https://github.com/Shou/Betaboards/raw/master/BetaBoards.user.js
// @downloadURL     https://github.com/Shou/Betaboards/raw/master/BetaBoards.user.js
// ==/UserScript==


// ! cp % ~/.mozilla/firefox/*.Hatate/gm_scripts/BetaBoards/

// XXX
// - On document.body 'mouseenter', check if mouse button is still down for
//   the dragging

// TODO
// - Don't add so many pages; use the ellipsis between pages.
//      - Check if pages exist, if not speedcore them.
//          - Make first page.
//      - If no ellipsis exists, create it and add the current page number after.
//      - Edit page number after ellipsis to match current page.
//      - If there are pages after the ellipsis' neighbor, remove them.

// FIXME
// - Attached files are quoted
// - postNums probably doesn't apply to updated posts
// - sometimes posts are loaded with missing TRs
// - ignored users only take up one TR which fucks up things
// - XHR encoding is incorrect; esp. on POST.
//      - Use document.characterSet (?) and modify XHR POST headers.

// {{{ Global variables

// | Global timeout variable
var loop
// | Global current post page
// cid :: Int
var cid = 0
// | Global init post page
// iid :: Int
var iid = 0
// | Amount of replies last loaded
// old :: Int
var old = 0
// | Global timeout length in milliseconds
// time :: Int
var time = 10000

// | Is mouse0 pressed
// mouse0 :: Bool
var mouse0 = false

// | When uploading the post. Work against double posts.
// posting :: Bool
var posting = false

// | ID of post to scroll to.
// scrollid :: String
var scrollid = null
// | Keep auto-scrolling with the page?
// ascroll :: Bool
var ascroll = false

// XXX removing vine script might cause unwanted behavior
// TODO account for video and audio ?GET=attributes
var embeds =
    { "vimeo":
        { u: "https?:\\/\\/vimeo\\.com\\/(\\S+)"
        , e: function(url) {
                return speedcore("iframe", { src: url
                                           , width: 640
                                           , height: 380
                                           , frameborder: 0
                                           , webkitallowfullscreen: true
                                           , mozallowfullscreen: true
                                           , allowfullscreen: true
                                           }, [])
             }
        , s: "//player.vimeo.com/video/$1"
        }
    , "soundcloud":
        { u: "(https?:\\/\\/soundcloud\\.com\\/\\S+)"
        , e: function(url) {
                return speedcore("iframe", { src: url
                                           , width: "100%"
                                           , height: 166
                                           , scrolling: "no"
                                           , frameborder: "no"
                                           }, [])
             }
        , s: "https://w.soundcloud.com/player/?url=$1"
        }
    , "audio":
        { u: "(https?:\\/\\/\\S+?\\.(mp3|ogg))"
        , e: function(url) {
                return speedcore("audio", { src: url
                                          , controls: true
                                          , width: 320
                                          , height: 32
                                          }, [])
             }
        , s: "$1"
        }
    , "video":
        { u: "(https?:\\/\\/\\S+?\\.(ogv|webm|mp4))"
        , e: function(url) {
                return speedcore("video", { src: url
                                          , controls: true
                                          , style: { maxWidth: "640px" }
                                          }, [])
             }
        , s: "$1"
        }
    , "vine":
        { u: "https?:\\/\\/vine.co\\/v\\/([a-zA-Z0-9]+)"
        , e: function(url) {
                return speedcore("iframe", { src: url
                                           , className: "vine-embed"
                                           , width: 480
                                           , height: 480
                                           , frameborder: 0
                                           }, [])
             }
        , s: "https://vine.co/v/$1/embed/simple"
        }
    }

// defaults :: Object String a
var defaults =
    { "beta-init-load": 2
    , "beta-load-amount": 0
    }

// }}}

// {{{ Debug

var verbose = false
var debug = true

// debug :: a -> IO ()
function debu(x){
    if (debug) console.log(x)
}

// verb :: a -> IO ()
function verb(x){
    if (verbose) console.log(x)
}

// trace :: a -> a
function trace(x){
    console.log(x)

    return x
}

// }}}

// {{{ Utils

// | All but the last element of a list.
// init :: [a] -> [a]
function init(xs) {
    var tmp = []
    for (var i = 0; i < xs.length - 1; i++) tmp.push(xs[i])
    return tmp
}

// | All but the first element of a list.
// tail :: [a] -> [a]
function tail(xs) {
    var tmp = []
    for (var i = 1; i < xs.length; i++) tmp.push(xs[i])
    return tmp
}

// | Last element of a list.
// last :: [a] -> a
function last(xs) {
    return xs[xs.length - 1]
}

// map :: (a -> b) -> [a] -> [b]
function map(f, xs) {
    var tmp = []
    for (var i = 0; i < xs.length; i++) tmp.push(f(xs[i]))
    return tmp
}

// | Set complement
// diff :: Array a -> Array a -> Array a
Array.prototype.diff = function(a) {
    return this.filter(function(i) { return a.indexOf(i) < 0 })
}

// | Set intersect
// inter :: Array a -> Array a -> Array a
Array.prototype.inter = function(a) {
    this.filter(function(n) { return a.indexOf(n) != -1 })
}

Array.prototype.mapDiff = function(f, xs) {
    xs = xs.map(f)
    return this.filter(function(x) { return xs.indexOf(f(x)) < 0 })
}

Array.prototype.mapInter = function(f, xs) {
    xs = xs.map(f)
    return this.filter(function(x) { return xs.indexOf(f(x)) != -1 })
}

// NodeList map
NodeList.prototype.map = function(f) {
    return Array.prototype.map.call(this, f)
}

NodeList.prototype.filter = function(f) {
    return Array.prototype.filter.call(this, f)
}

NodeList.prototype.mapDiff = function(f, xs) {
    xs = xs.map(f)
    return this.filter(function(x) { return xs.indexOf(f(x)) < 0 })
}

NodeList.prototype.mapInter = function(f, xs) {
    xs = xs.map(f)
    return this.filter(function(x) { return xs.indexOf(f(x)) != -1 })
}

NodeList.prototype.slice = function() {
    if (arguments.length === 1)
        return Array.prototype.slice.call(this, arguments[0])
    else if (arguments.length === 2)
        return Array.prototype.slice.call(this, arguments[0], arguments[1])
    else
        throw (new Error("No argument(s) to function `NodeList.prototype.slice'"))
}

// | No more Flydom!
// speedcore :: String -> Obj -> Tree -> Elem
function speedcore(tagname, attrs, childs) {
    var e = document.createElement(tagname);
    for (k in attrs){
        if (typeof attrs[k] === "object")
            for (l in attrs[k])
                e[k][l] = attrs[k][l];
        else e[k] = attrs[k];
    }
    for (var i = 0; i < childs.length; i = i + 3){
        var el = speedcore( childs[i]
                          , childs[i + 1]
                          , childs[i + 2]
                          );
        e.appendChild(el);
    }

    return e;
}

// TODO turn octave elements to their original URLs
// fromBBCode :: Elem -> String
function fromBBCode(e) {
    e.innerHTML = e.innerHTML.replace(/<br>/g, "\n")

    var srcs = { "img": "[img]%s[/img]", "iframe": "%s" }
      , wraps = { "strong": "b", "em": "i", "u": "u", "sup": "sup"
                , "sub": "sub"
                }
      , datas = { "object": "%s" }

    for (var t in srcs) {
        var es = e.getElementsByTagName(t)
        for (var i = 0; i < es.length; i++)
            es[i].textContent = srcs[t].replace(/%s/g, es[i].src)
    }

    for (var t in wraps) {
        var es = e.getElementsByTagName(t)
        for (var i = 0; i < es.length; i++)
            es[i].textContent = "[" + wraps[t] + "]"
                              + es[i].textContent
                              + "[/" + wraps[t] + "]"
    }

    for (var t in datas) {
        var es = e.getElementsByTagName(t)
        for (var i = 0; i < es.length; i++)
            es[i].textContent =
                es[i].data.replace( /https?:\/\/(www\.)?youtube.com\/v\/([^\?]+).*/
                                  , "https://youtu.be/$2"
                                  )
    }

    var ss = e.getElementsByClassName("spoiler")
    for (var i = 0; i < ss.length; i++) {
        ss[i].previousElementSibling.textContent =
            "[spoiler=" + ss[i].previousElementSibling.textContent + "]"
        ss[i].textContent = ss[i].textContent + "[/spoiler]"
    }

    var cs = e.getElementsByTagName("span")
    for (var i = 0; i < cs.length; i++) {
        if (cs[i].style.color !== "")
            cs[i].textContent = "[color=" + cs[i].style.color + "]"
                              + cs[i].textContent
                              + "[/color]"

        else if (cs[i].style.backgroundColor !== "")
            cs[i].textContent = "[bgcolor=" + cs[i].style.backgroundColor + "]"
                              + cs[i].textContent
                              + "[/bgcolor]"

        else if (cs[i].style.textAlign === "center")
            cs[i].textContent = "[center]" + cs[i].textContent + "[/center]"

        else if (cs[i].style.fontFamily !== "")
            cs[i].textContent = "[font=" + cs[i].style.fontFamily + "]"
                              + cs[i].textContent
                              + "[/font]"

        else if (cs[i].style.border !== "")
            cs[i].textContent = "[border=" + cs[i].style.border + "]"
                              + cs[i].textContent
                              + "[/border]"
    }

    return e.textContent
}

// def :: a -> a -> a
function def(x, y) {
    if (y) return y
    else return x
}

// slice :: [a] -> [a]
var slice = Array.prototype.slice

// modifiy :: String -> (IO ())
function modify(k){ return function(){
    localStorage[k] = JSON.stringify(this.value.split(','))
}}

// readify :: String -> [a]
function readify(k, a){
    try {
        return JSON.parse(localStorage[k])

    } catch(e) {
        debu(e.toString())
        return a
    }
}

// togglify :: String -> (Event -> IO ())
function togglify(k) { return function(e) {
    if (this.checked) localStorage[k] = this.checked
    else delete localStorage[k]
}}

// textify :: String -> (Event -> IO ())
function textify(k) { return function(e) {
    localStorage[k] = this.value
}}

// selectify :: String -> (Event -> IO ())
function selectify(k) { return function(e) {
    localStorage[k] = this.selectedIndex
}}

// Set temporary class name; useful for temporary styles.
function tempClassName(e, cn, t) {
    e.className += ' ' + cn
    setTimeout(function() {
        e.className = e.className.replace(' ' + cn, "")
    }, t)
}

// }}}

// {{{ XHR

// TODO reinstate debu(xhr)
// request :: String -> IO ()
function request(url, f) {
    var xhr = new XMLHttpRequest()

    xhr.timeout = 10000
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            f(xhr.responseText)
        }

        else null //debu(xhr)
    }

    xhr.open("GET", url, true)
    xhr.send()
}

// reply :: Elem -> IO ()
function reply(t) {
    verb("Replying...")

    var url = '/' + getForum() + "/post/"
    var oargs = getPostArgs(t)
    var args = ""
    var str = t.value

    for (var k in oargs) args += (k + '=' + oargs[k] + '&')

    args += "post=" + encodeURIComponent(str).replace("%20", "+")

    verb("Posting reply...")

    var xhr = new XMLHttpRequest()
    xhr.timeout = 10000
    xhr.onreadystatechange = function(){
        if (xhr.readyState === 4 && xhr.status === 200) {
            verb("Replied.")

            if (readify('beta-loading', true)) addPosts(xhr.responseText)
            t.value = ""

            t.className = t.className.replace(/ beta-loading/, "")
            tempClassName(t, "beta-load-ok", 2000)

            posting = false

        } else if (xhr.readyState === 4) posting = false

        else debu(xhr)
    }

    // Don't post if it's empty.
    if (str.length > 0) {
        xhr.open("POST", url, true)
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded")
        xhr.send(args)

        tempClassName(t, "beta-loading", 10000)

        posting = true

        // timeout posting
        setTimeout(function() { posting = false }, 10000)

    } else tempClassName(t, "beta-load-fail", 2000)
}

// }}}

// {{{ DOM Finders

// quickReply :: IO Elem
function quickReply(){
    var e = document.getElementById("fast-reply")

    return e.getElementsByTagName("textarea")[0]
}

// | Get the tbody containing post <tr>s
// tbody :: IO Elem
function tbody(){
    var e = document.getElementById("main").getElementsByClassName("topic")[0]

    return e.children[1]
}

// | Get original <tr>s
// inittrs :: IO [Elem]
function inittrs(){
    var tb = tbody()
    var es = tb.children

    if (tb.querySelector(".btn_mod") !== null) es = init(es)

    return init(tail(es))
}

// | Find the post table rows and return them.
// focus :: Elem -> IO [Elem]
function focus(div){
    var e = div.getElementsByClassName("topic")[0]

    if (e) {
        var es = e.children[1].children

        return tail(es)

    } else return []
}

// | Find the topics and return their parent.
// focusThreads :: Elem -> IO Elem
function focusThreads(div){
    var e = div.getElementsByClassName("posts")[0]

    return e
}

// | Get the class="c_view" element.
// lastUserlist :: IO Elem
function lastUserlist(){
    var ft = document.querySelector(".c_view")
    verb("BENIS")
    verb(ft)
    var ftl = ft.parentNode

    return ftl
}

// postUsername :: Elem -> IO String
function postUsername(tr){
    return tr.previousElementSibling.children[0].textContent
}

// usernames :: IO [Elem]
function usernames(){
    return document.getElementsByClassName("c_username")
}

// usernamePost :: Elem -> IO Elem
function usernamePost(e){
    return e.parentNode.nextElementSibling.children[1]
}

// }}}

// {{{ DOM Modifiers

// addIgnoredIds :: [Elem] -> IO ()
function addIgnoredIds(xs) {
    var tmp = []

    for (var i = 0; i < xs.length; i++) {
        if (xs[i].className === "ignored") {
            var a = xs[i].querySelector("a[href*='/single/']")
            var tr = xs[i].parentNode
            tr.id = "post-" + a.href.match(/\/single\/\?p=(\d+)/)[1]
            tmp.push(tr)

        } else tmp.push(xs[i])
    }

    return tmp
}

// fiveSiblings :: Elem -> [Elem]
function fiveSiblings(e) {
    var es = [ e, e.nextElementSibling
             , e.nextElementSibling.nextElementSibling
             , e.nextElementSibling.nextElementSibling.nextElementSibling
             , e.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling
             ]

    return es
}

// removeOld :: IO ()
function removeOld() {
    var oids = document.querySelectorAll("tr[id^='post-']")
      , tvib = document.querySelector("#topic_viewer > tbody")
      , amount = [NaN, 25, 50, 100, 250][readify("beta-load-amount", 0)]
      , height = 0
      , roidslen = oids.length

    if (amount !== NaN) {
        // Negative of how many posts to keep, slice keeps that amount backwards
        var n = oids.length - amount
        var ooids = oids.slice(0, n > 0 ? n : 0)

        debu("Old removed posts: " + ooids.length)
        ooids.map(function(e) {
            var es
            if (! e.querySelector(".ignored"))
                es = fiveSiblings(e)
            else es = [e]

                for (var i = 0; i < es.length; i++) {
                    height += es[i].offsetHeight
                    tvib.removeChild(es[i])
                }

        })

        // FIXME pages are ADDED when NOT NEEDED FUCK
        // - ONLY remove 25 replies at a time?
        //      - slice(0, Math.ceil(n / 25) * 25)
        if (ooids.length > 0) iid = cid
        roidslen = oids.length - ooids.length
    }

    window.scrollBy(0, height * -1)

    return roidslen
}

// addPosts :: String -> IO ()
function addPosts(html) {
    verb("Initiating addPosts...")

    try {

    var par = new DOMParser()
      , doc = par.parseFromString(html, "text/html")
      // Old and new posts
      , oids = document.querySelectorAll("tr[id^='post-']")
      , nids = addIgnoredIds(doc.querySelectorAll("tr[id^='post-'], .ignored"))
      // Old and new userlists
      , ous = document.querySelector(".c_view")
      , nus = doc.querySelector(".c_view")
      // t_viewer body
      , tvib = document.querySelector("#topic_viewer > tbody")
      // oids without previous pages; newly old IDs
      , noids = oids.slice(Math.floor(oids.length / 25) * 25)

    debu( "oids: " + oids.length + ", nids: " + nids.length + ", noids: "
        + noids.length
        )

    debu(noids)

    // Replace userlist
    ous.parentNode.replaceChild(nus, ous)

    // TODO generalize code
    // New posts, removed posts and equal posts
    var newps = nids.mapDiff(function(e) { return e.id }, oids)
      , remps = noids.mapDiff(function(e) { return e.id }, nids)
      , oldps = nids.mapInter(function(e) { return e.id }, oids)

    // Remove deleted posts
    debu("Removed posts: " + remps.length)
    remps.map(function(e) {
        var es
        if (! e.querySelector(".ignored"))
            es = fiveSiblings(e)
        else es = [e]

            for (var i = 0; i < es.length; i++) {
                tvib.removeChild(es[i])
            }

    })

    // Add new posts
    debu("New posts: " + newps.length)
    newps.map(function(e) {
        var es
        if (! e.querySelector(".ignored"))
            es = fiveSiblings(e)
        else es = [e]

        for (var i = 0; i < es.length; i++) {
            tvib.insertBefore(es[i], tvib.querySelector(".c_view").parentNode)

            // Add spoiler event
            if (i == 1) addSpoilerEvent(es[i])

            // Add quick quote event
            if (i === 3) addQuoteEvent(es[i])
        }
    })

    if (newps.length > 0 && readify("beta-beep", false))
        document.querySelector("#beta-beep").play()

    // Update time before update detecting
    if (newps.length > 0 || remps.length > 0) time = 10000
    else time = Math.min(160000, Math.floor(time * 1.5))

    // Update old posts
    debu("Old posts: " + oldps.length)
    oldps.map(function(e) {
        if (! e.querySelector(".ignored")) {
            var eq = document.querySelector('#' + e.id)
              , ne = e.nextElementSibling.children[1]
              , oe = eq.nextElementSibling.children[1]

            // Replace timestamp
            eq.parentNode.replaceChild(e, eq)

            verb(e.textContent.replace(/\s+/g, ' '))

            updatePost(ne, oe)
        }
    })

    octave()

    var roidslen = removeOld()

    // TODO test against deleted posts, might get stuck on page from < 25 posts
    // Switch to new page
    cid = iid + Math.floor(roidslen / 25)

    debu(cid)

    } catch(e) { throw e }
}

// TODO generalize the SHIT out of this you B I T C H
// TODO remove deleted nodes
// updatePost :: Elem -> Elem -> IO ()
function updatePost(ne, oe) {
    var coe = oe.childNodes
      , cne = ne.childNodes
      , changed = false

    verb("cne #" + cne.length + ", coe #" + coe.length)

    try {

    // Add or change nodes
    for (var i = 0; i < cne.length; i++) {
        verb( "cne.nodeType: " + cne[i].nodeType + "; coe.nodeType: "
            + (coe[i] ? coe[i].nodeType : undefined)
            )
        verb("cne #" + ne.childNodes.length + ", coe #" + oe.childNodes.length)

        if (! coe[i]) {
            verb("updatePost: Append " + i + " / " + cne.length)

            oe.appendChild(ne.childNodes[i].cloneNode(true))

        } else if ( cne[i].nodeType === 3
                 && coe[i].nodeType === 3) {
            verb("updatePost: Text")

            if (coe[i].textContent !== cne[i].textContent) {
                coe[i].textContent = cne[i].textContent

                changed = true
            }

        } else if ( cne[i].nodeType === 1
                 && coe[i].nodeType === 1
                 && cne[i].tagName === coe[i].tagName) {
            verb("updatePost: Element")

            if (cne[i].tagName === "OBJECT") {
                if (cne[i].data !== coe[i].data) {
                    coe[i].data = cne[i].data

                    changed = true

                } else if ( cne[i].width !== coe[i].width
                         || cne[i].height !== coe[i].height) {
                    coe[i].width = cne[i].width
                    coe[i].height = cne[i].height

                    changed = true
                }

            } else if (cne[i].tagName === "IMG") {
                if (cne[i].src !== coe[i].src) {
                    coe[i].src = cne[i].src

                    changed = true
                }

            } else if (cne[i].tagName === "DIV") {
                // Recursion for deeper elements!
                var dc = updatePost(cne[i], coe[i])

                if (dc) changed = true
            }

        } else if ( cne[i].nodeType === 1
                 && coe[i].nodeType === 1
                 && cne[i].tagName === "A") {
            verb("updatePost: Octave")

            var nm = cne[i].href.match(RegExp(embed[k].u, 'g'))
              , nsrc = cne[i].href
            for (var k in embeds)
                nsrc = nsrc.replace(RegExp(embeds[k].u, 'g'), embeds[k].s)

            if (coe[i].tagName === "IFRAME") {
                if (coe[i].src !== nsrc) {
                    oe.replaceChild(ne.childNodes[i], oe.childNodes[i])

                    changed = true
                }

            } else if (coe[i].tagName === "VIDEO"
                    || coe[i].tagName === "AUDIO") {

                if (coe[i].src !== cne[i].href && nm) {
                    coe[i].src = cne[i].href

                    changed = true

                } else if (nm) {
                    oe.replaceChild(ne.childNodes[i], oe.childNodes[i])

                    changed = true

                }
            }

        } else {
            verb("updatePost: simple replace")
            oe.replaceChild(ne.childNodes[i].cloneNode(true), oe.childNodes[i])

            changed = true
        }
    }

    verb("cne #" + ne.childNodes.length + ", coe #" + oe.childNodes.length)

    // FIXME deletes appended nodes ???
    // Remove deleted nodes
    if (coe.length > cne.length) {
        // coe.length changes
        var len = coe.length

        // remove excessive nodes
        for (var i = cne.length; i < len; i++) {
            debu("updatePost: Removing node " + i + " / " + len)

            oe.removeChild(coe[cne.length])
        }
    }

    verb("updatePost: changed? " + changed)
    if (changed) time = 10000

    } catch(e) { debu(e.toString()) }

    return changed
}

// addTopics :: String -> IO ()
function addTopics(html) {
    var dom = lastUserlist()
    var d = insert(html)
    var x = focusThreads(d)
    var it = document.getElementById("inlinetopic")
    var old = it.getElementsByClassName("posts")[0]
    var us = d.getElementsByClassName("c_view")[0].parentNode

    var modified = false
    var olds = old.getElementsByTagName("tr")
    var xs = x.getElementsByTagName("tr")

    for (var i = 0; i < olds.length; i++) {
        try {
            var or = parseInt(olds[i].children[3].textContent.replace(/,/g, ""))
            var nr = parseInt(xs[i].children[3].textContent.replace(/,/g, ""))
            var ot = olds[i].children[1].children[1].textContent
            var nt = xs[i].children[1].children[1].textContent

            if (or !== nr) {
                modified = true
                break

            } else if (ot !== nt) {
                modified = true
                break
            }

        } catch(e){ verb(e) }
    }

    // Remove loaded HTML
    d.parentNode.removeChild(d)

    // Swap topics
    it.removeChild(old)
    it.appendChild(x)
    // addHideButtons(xs)

    // Update userlist
    dom.parentNode.replaceChild(us, dom)

    if (modified) {
        verb("Threads modified")
        time = 6667

    } else time = Math.min(160000, Math.floor(time * 1.5))

    verb("Set time to " + time)
}

// insert :: String -> IO Elem
function insert(html) {
    var e = document.createElement("div")
    document.body.appendChild(e)
    e.innerHTML = html

    return e
}

// remNextButton :: IO ()
function remNextButton() {
    var ns = document.getElementsByClassName("c_next")
    map(function(n){ n.parentNode.parentNode.removeChild(n.parentNode) }, ns)
}

// postNums :: IO ()
function postNums() {
    if (readify('beta-postnums', false)) {
        var rs = document.getElementsByClassName("c_postinfo")

        for (var i = 0; i < rs.length; i++) {
            try {
            rs[i].children[1].children[0].textContent = "Post link"
            } catch(e) { debu(e) }
        }
    }
}

// FIXME find all form elements with "name" and "value" attributes
// getPostArgs :: Elem -> IO Obj
function getPostArgs(t) {
    var ts = t.parentNode.parentNode.parentNode.getElementsByTagName("input")
    var o = {}

    for (var i = 0; i < ts.length; i++)
        if (ts[i].type === "hidden") o[ts[i].name] = ts[i].value

    o["sd"] = '1'

    return o
}

// | Highlight the elements that have actions during Ctrl mode.
// highlightModeElems :: Bool -> IO ()
function highlightModeElems(b) {
    verb("Highlighting elements? " + b)

    var s = document.getElementById("beta-style-highlight")

    if (s === null) {
        s = document.createElement("style")
        s.id = "beta-style-highlight"
    }

    if (b) s.textContent =
        ".beta-highlight { box-shadow: 0 0 10px #66ccff !important }"

    else s.textContent = ""

    document.body.appendChild(s)
}

// hideUserlists :: IO ()
function hideUserlists() {
    if (readify('beta-userlist', false)) {
        debu("Hiding userlists!")
        var s = document.createElement("style")
        s.id = "beta-style-userlist"

        s.textContent = ".c_view-list { display: none !important } "

        document.body.appendChild(s)
    }
}

// toggleFloatingQR :: IO ()
function toggleFloatingQR() {
    if (localStorage["beta-floating"]) delete localStorage["beta-floating"]
    else localStorage["beta-floating"] = '1'

    floatQR()
}

// floatQR :: IO ()
function floatQR() {
    var q = quickReply().parentNode.parentNode

    if (localStorage["beta-floating"]) {
        q.style.position = "fixed"
        q.style.width = def("400px", localStorage["beta-fl-width"])
        moveQR()

        q.children[0].style.cursor = "move"

        q.children[0].addEventListener("mousedown", function(e){
            if (e.button === 0) mouse0 = true
            document.body.addEventListener("mousemove", moveQR)
        })
        document.body.addEventListener("mouseup", function(e){
            if (e.button === 0) mouse0 = false
            document.body.removeEventListener("mousemove", moveQR)
        })

    } else {
        q.style = ""
        q.children[0].style = ""
    }

    document.querySelector("#c_post textarea").style.height = localStorage["beta-post-size"]

    var floato = new MutationObserver(function(ms) {
            if (ms.length > 0) {
                localStorage['beta-post-size'] =
                    document.querySelector("#c_post textarea").style.height
            }
    })

    var ops = { subtree: false, childList: false, attributes: true }

    floato.observe(document.querySelector("#c_post textarea"), ops)
}

// moveQR :: Event -> IO ()
function moveQR(e) {
    verb("Moving QR...")
    var q = quickReply().parentNode.parentNode

    if (e) {

        localStorage["beta-fl-x"] =
            def(0, Math.max(e.screenX - q.scrollWidth / 2, 0))
        localStorage["beta-fl-y"] =
            def(0, Math.max(e.screenY - q.scrollHeight / 2, 0))
    }

    q.style.top = Math.max(0, Math.min(
          def(0, parseInt(localStorage["beta-fl-y"]))
        , window.innerHeight - q.scrollHeight
    )) + "px"
    q.style.left = Math.max(0, Math.min(
          def(0, parseInt(localStorage["beta-fl-x"]))
        , window.innerWidth - q.scrollWidth
    )) + "px"
}

// hint :: String -> (Event -> IO ())
function hint(s) { return function(e) {
    if (! readify("beta-hints", false)) {
        var d = document.querySelector("#beta-popup")

        if (! d) {
            d = document.createElement("div")

            d.style.position = "fixed"
            d.style.border = "4px solid rgba(255,255,255,0.1)"
            d.style.background = "rgba(0,0,0,0.7)"
            d.style.maxWidth = "200px"
            d.style.padding = "5px"
            d.style.borderRadius = "1px 1px"
            d.style.color = "#fefefe"

            d.id = "beta-popup"

            document.body.appendChild(d)
        }

        d.textContent = s

        d.style.top = (e.clientY - 50) + "px"
        d.style.left = (e.clientX + 20) + "px"
    }
}}

// }}}

// {{{ Events

// | Add the initial events.
// initEvents :: IO ()
function initEvents() {
    verb("Making init events...")
    var qr = quickReply()

    qr.className += " beta-highlight"
    qr.nextElementSibling.title =
        "Ctrl-Enter to post while focused on the textfield."

    // Ctrl mode
    document.body.addEventListener("keydown", function(e){
        if (e.ctrlKey) {
            verb("Ctrl true")
            setTimeout(function(){ highlightModeElems(true) }, 0)
        }
    })
    document.body.addEventListener("keyup", function(e){
        if (e.keyCode === 17 || !e.ctrlKey) {
            verb("Ctrl false")
            setTimeout(function(){ highlightModeElems(false) }, 0)
        }
    })

    // Post submit
    qr.addEventListener("keydown", function(e){
        if (e.ctrlKey && e.keyCode === 13 && !posting) reply(this)
        else if (posting) verb("Mutlipost avoided.")
    })
    qr.nextElementSibling.addEventListener("click", function(e){
        e.preventDefault()
        verb("Click")
        if (!posting) reply(this.previousElementSibling)
        else verb("Multipost avoided.")
    })

    // Float QR
    qr.addEventListener("click", function(e){
        if (e.ctrlKey && e.button === 0) toggleFloatingQR()
    })

    // Hint
    qr.nextElementSibling.addEventListener( "mouseover"
                                          , hint(qr.nextElementSibling.title))
    qr.nextElementSibling.addEventListener("mouseout", function(e) {
        var bp = document.querySelector("#beta-popup")
        bp.parentNode.removeChild(bp)
    })

    // Quote events
    var oids = document.querySelectorAll("tr[id^='post-'] + tr + tr + tr")
    for (var i = 0; i < oids.length; i++) {
        addQuoteEvent(oids[i])
    }
}

// addSpoilerEvent :: Elem -> IO ()
function addSpoilerEvent(tr) {
    var sps = tr.getElementsByClassName("spoiler_toggle")

    if (sps.length > 0) {
        verb("Adding " + sps.length + " spoiler events... ")
        debu(sps)
    }

    for (var j = 0; j < sps.length; j++) {
        sps[j].addEventListener("click", function(){
            var s = this.nextElementSibling.style
            s.display = s.display === "" ? "none" : ""
        })
    }
}

// addQuoteEvent :: Elem -> IO ()
function addQuoteEvent(tr) {
    var q = tr.querySelector(".c_footicons .right [href*='/post/']")
    q.className += " beta-highlight"
    q.title = "Ctrl-click to quick quote."

    // Hint
    q.addEventListener("mouseover", hint(q.title))
    q.addEventListener("mouseout", function(e) {
        var bp = document.querySelector("#beta-popup")
        bp.parentNode.removeChild(bp)
    })

    q.addEventListener("click", function(e){
        if (e.ctrlKey && e.button === 0) {
            e.preventDefault()

            verb("Quick quoting...")

            // tr :: Elem
            var tr = this.parentNode.parentNode.parentNode
            var p = tr.previousElementSibling.previousElementSibling
            var post = p.children[1].cloneNode(true)
            // u :: String
            var u = p.previousElementSibling.children[0].textContent.trim()

            // XXX wont this crash and explode if the parentNode of some child
            //     is already gone
            var bs = post.getElementsByTagName("blockquote")
            var cs = post.getElementsByClassName("editby")
            for (var i = 0; i < bs.length; i++)
                post.removeChild(bs[i])
            // > no concat function for HTMLCollection
            // are u kidding me
            for (var i = 0; i < cs.length; i++)
                post.removeChild(cs[i])

            // t :: String
            var t = fromBBCode(post).trim()

            var bbcode = "[quote=" + u + "]" + t + "[/quote]"

            quickReply().value += bbcode

        }
    })
}

// addPostEvent :: IO ()
function addPostEvent() {
    var pt = document.querySelector("#c_post-text")

    pt.addEventListener("keydown", function(e){
        if (e.ctrlKey && e.keyCode === 13) {
            var pf = document.querySelector(".exclusivebutton")

            pf.submit()
        }
    })
    var btn = document.querySelector("[accesskey='s'][type='submit']")
    btn.title = "Ctrl-Enter to post while focused on the textfield."

    btn.addEventListener("mouseover", hint(btn.title))
    btn.addEventListener("mouseout", function(e) {
        var bp = document.querySelector("#beta-popup")
        bp.parentNode.removeChild(bp)
    })
}

// addQuickMsgEvent :: IO ()
function addQuickMsgEvent() {
    var qt = document.querySelector("#quickcompose")

    qt.addEventListener("keydown", function(e){
        if (e.ctrlKey && e.keyCode === 13) {
            var pf = document.querySelector(".exclusivebutton")

            pf.submit()
        }
    })

    var btn = document.querySelector("[accesskey='s'][type='submit']")
    btn.title = "Ctrl-Enter to post while focused on the textfield."

    btn.addEventListener("mouseover", hint(btn.title))
    btn.addEventListener("mouseout", function(e) {
        var bp = document.querySelector("#beta-popup")
        bp.parentNode.removeChild(bp)
    })
}

// addHintEvents :: IO ()
function addHintEvents() {
    var es = document.querySelectorAll("[title]")

    for (var i = 0; i < es.length; i++) {
        es[i].addEventListener("mouseover", hint(es[i].title))
        es[i].addEventListener("mouseout", function(e) {
            var bp = document.querySelector("#beta-popup")
            bp.parentNode.removeChild(bp)
        })

        es[i].title = ""
    }
}

// }}}

// {{{ Zeta

// isLastPage :: Int -> IO Bool
function isLastPage(n) {
    var f
    var l

    try {
        f = document.querySelector(".cat-pages li span").textContent
        l = document.querySelector(".cat-pages li:last-child").textContent

        verb("f: " + f + ", l: " + (l - n))

        return parseInt(f) >= parseInt(l) - n

    } catch(e) {
        verb("isLastPage: " + e.toString())
        return true
    }
}

// getPage :: IO Int
function getPage() {
    var url = window.location.pathname.split('/')

    return parseInt(url[url.length - 2])
}

// getId :: IO String
function getId() {
    var url = window.location.pathname.split('/')

    return url[url.length - 3]
}

// getURL :: IO String
function getURL() {
    var url = window.location.pathname.split('/').slice(0, 4).join('/')

    return url + '/' + cid + '/'
}

// getForum :: IO String
function getForum() {
    var url = window.location.pathname.split('/')

    return url[1]
}

// isForum :: IO Bool
function isForum() {
    var url = window.location.pathname.split('/')

    return url[2] === "forum"
}


// isTopic :: IO Bool
function isTopic() {
    var url = window.location.pathname.split('/')

    return url[2] === "topic"
}

// isHome :: IO Bool
function isHome() {
    var url = window.location.pathname.split('/')

    verb("isHome: " + url[2] === "home")
    return url[2] === "home"
}

// isPost :: IO Bool
function isPost() {
    var url = window.location.pathname.split('/')

    verb("isPost: " + url[2] === "post")
    return url[2] === "post"
}

// isPage :: IO Bool
function isPage(s) {
    var url = window.location.pathname.split('/')

    verb("isPost: " + url[2] === s)
    return url[2] === s
}

// }}}

// {{{ High octave sexual moaning

// replacer :: String -> Either Null Elem
function replacer(x){
    var e = null

    for (var k in embeds) {
        var r = RegExp(embeds[k].u, 'g')
        var m = x.match(r)

        if (m) {
            e = embeds[k].e(x.replace(r, embeds[k].s))
        }
    }

    return e
}

// high :: Elem -> IO ()
function high(e){
    var as = e.getElementsByTagName("a")

    // each link
    for (var j = 0; j < as.length; j++) {
        try {
            var ass = as[j]
              , ene = replacer(ass.href)

            if (ene) {
                log("ene.tagName: " + ene.tagName)
                log("ene.hasAudio: " + ene.mozHasAudio)

                if (ene.tagName === "VIDEO") {
                    ene.addEventListener("loadeddata", function(e) {
                        log("moz: " + this.mozHasAudio)
                        log("webkit: " + this.webkitAudioDecodedByteCount)
                        var hasAudio = this.mozHasAudio === undefined
                                     ? this.webkitAudioDecodedByteCount > 0
                                     : this.mozHasAudio

                        if (! hasAudio) {
                            this.loop = true
                            this.muted = true
                            if (localStorage["coup-z-webm"])
                                this.autoplay = true

                            else this.controls = true

                            this.style.cursor = "pointer"
                            this.title = "Toggle play"

                            this.addEventListener("click", function(e) {
                                if (this.controls) {
                                    log("Controls")
                                    this.controls = false

                                } else {
                                    log("No controls")
                                    if (this.paused) this.play()
                                    else this.pause()
                                }
                            })
                        }
                    })
                }

                ass.parentNode.replaceChild(ene, ass)
            }

        } catch(e) {
            log(e.toString())
        }
    }
}

// octave :: IO ()
function octave(){
    log("High octave sexual moaning")
    var xs = document.getElementsByClassName("c_post")

    // Each post
    for (var i = 0; i < xs.length; i++) {
        (function (ii){
            high(xs[ii])
        })(i)
    }
}

// }}}

// {{{ Quote pyramids

// quotePyramid :: Elem -> IO ()
function quotePyramid(s) {
    if (! readify('beta-quotes', false)) {

        var qhs = ".c_post > blockquote blockquote div { display: none } "
                + ".c_post > blockquote blockquote:hover div { display: block }"

        s.textContent += qhs

    }
}

// }}}

// pageUpdate :: IO ()
function pageUpdate() {
    var b = readify('beta-loading', false)

    if (! b) {
        console.log(cid)

        try {
            var url = getURL()
            console.log(url)
            request(url, addPosts)
        
            window.history.pushState(null, null, getURL())

        } catch(e) {
            debu(e)
        }
    }
}

// forumUpdate :: IO ()
function forumUpdate() {
    var b = readify('beta-refreshing', false)

    if (! b) {
        try {
            var url = window.location.pathname
            console.log(url)
            request(url, addTopics)

        } catch(e) {
            debu(e)
        }
    }
}

// style :: IO Elem
function style() {
    verb("Styling...")
    var e = document.createElement("style")
    var css = ""
    var csss = []

    var ids = []
    try { ids = JSON.parse(localStorage['beta-memberids']) }
    catch(e) { debu(e.toString()) }

    for (var i = 0; i < ids.length; i++)
        csss.push("a[href*=\"" + ids[i] + "\"]")

    css = csss.join(',')
    if (css.length > 0) css += " { display: none !important }"

    css += ".beta-loading { animation: loading 2s infinite; border-width: 4px; "
         + "border-style: solid } "
         + ".beta-load-ok { animation: success 2s infinite; border-width: 4px; "
         + "border-style: solid }"
         + ".beta-load-fail { animation: failure 2s infinite; border-width: 4px; "
         + "border-style: solid }"
         + "@keyframes loading { 0% { border-color: transparent } 50% { "
         + "border-color: #16B } 100% { border-color: transparent } }"
         + "@keyframes success { 20% { border-color: lime } 30% { border-color: "
         + "lime } 31% { border-color: transparent } 36% { border-color: "
         + "transparent } 37% { border-color: lime } 57% { border-color: lime } }"
         + "@keyframes failure { 20% { border-color: crimson } 30% { "
         + "border-color: crimson } 31% { border-color: transparent } 36% {"
         + "border-color: transparent } 37% { border-color: crimson } 57% {"
         + "border-color: crimson } }"

    e.innerHTML = css

    document.body.appendChild(e)

    return e
}

// ignoredUsers :: IO [String]
function ignoredUsers() {
    try {
        return JSON.parse(localStorage['beta-ignoredusers'])

    } catch(e){
        debu(e.toString())
        return []
    }
}

// ignoredPosts :: IO Regex
function ignoredPosts() {
    var ms = []
    var re = ""

    try {
        ms = JSON.parse(localStorage['beta-ignoredposts'])
    } catch(e){
        debu(e.toString())
    }

    for (var i = 0; i < ms.length; i++){
        re += "" + ms[i] + ""
        if (i < ms.length - 1) re += '|'
    }

    verb(re)

    if (re.length > 0) return new RegExp(re, "i")
    else return null
}

// ignore :: IO ()
function ignore(){
    var b = readify('beta-ignoring', false)

    if (! b) {
        verb("Ignoring...")
        var us = usernames()

        for (var i = 0; i < us.length; i++){
            var uname = us[i].children[0].textContent
            var users = ignoredUsers()
            var posts = ignoredPosts()

            try {
                if (users.indexOf(uname) !== -1){
                    verb("Ignoring " + uname)
                    var e = us[i].parentNode
                    e.style.display = "none"
                    e.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.nextElementSibling.style.display = "none"

                } else if (posts !== null
                       && usernamePost(us[i]).textContent.match(posts)) {
                    verb("Ignoring post of " + uname)
                    var e = us[i].parentNode
                    e.style.display = "none"
                    e.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.nextElementSibling.style.display = "none"
                }

            } catch(e) {
                debu(e.toString())
            }
        }
    }
}

// {{{ UI

// optionsUI :: IO ()
function optionsUI(){
    verb("Creating options UI...")
    var main = document.getElementById("main")

    var ui = speedcore("table", { id: "beta-settings" }, [
        "thead", {}, [
            "tr", {}, [
                "th", { colSpan: "6", textContent: "Settings" }, []
            ]
        ],
        "tbody", {}, [
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable reply loading" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-loading', false)
                             , onchange: togglify('beta-loading')
                             , title: "Prevent replies from being loaded and "
                                    + "extending the page automatically."
                             }, []
                ],
                "td", { className: "c_desc", textContent: "Early reply loading" }, [],
                "td", {}, [
                    "select", { id: "beta-init-load"
                              , onchange: selectify('beta-init-load')
                              , title: "How many pages behind the last to "
                                     + "start loading replies on."
                              }, [
                        "option", { textContent: "0" }, [],
                        "option", { textContent: "2" }, [],
                        "option", { textContent: "5" }, [],
                        "option", { textContent: "10" }, [],
                        "option", { textContent: "∞" }, []
                    ]
                ],
                "td", { className: "c_desc", textContent: "Max reply load" }, [],
                "td", {}, [
                    "select", { id: "beta-load-amount"
                              , onchange: selectify("beta-load-amount")
                              , title: "Maximum replies to have loaded. "
                                     + "Removes older replies to make room. "
                                     + "Experimental feature."
                              }, [
                        "option", { textContent: "∞" }, [],
                        "option", { textContent: "25" }, [],
                        "option", { textContent: "50" }, [],
                        "option", { textContent: "100" }, [],
                        "option", { textContent: "250" }, []
                    ]
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable topic refreshing" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-refreshing', false)
                             , onchange: togglify('beta-refreshing')
                             , title: "Prevent topics from being refreshed "
                                    + "automatically."
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable ignoring" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-ignoring', false)
                             , onchange: togglify('beta-ignoring')
                             , title: "Disable the full ignore feature."
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable quote collapsing" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-quotes', false)
                             , onchange: togglify('beta-quotes')
                             , title: "Prevent quotes nested deeper than the "
                                    + "first level from collapsing."
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Hide post numbers" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-postnums', false)
                             , onchange: togglify('beta-postnums')
                             , title: "Hide the post numbers attached to posts."
                             }, []
                ],
                "td", { className: "c_desc", textContent: "Hide userlist" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-userlist', false)
                             , onchange: togglify('beta-userlist')
                             , title: "Hide userlists on any page."
                             }, []
                ],
                "td", { className: "c_desc", textContent: "Hide hints" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-hints', false)
                             , onchange: togglify('beta-hints')
                             , title: "Hide pop-up hints on any page."
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "WebM autoplay" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: def(false, localStorage["coup-z-webm"])
                             , onchange: togglify("coup-z-webm")
                             , title: "Autoplay WebM videos."
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Beep on new replies" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify("beta-beep", false)
                             , onchange: togglify("beta-beep")
                             , title: "Play a beep notification sound when "
                                    + "there are new replies."
                             }, []
                ],
                "td", { className: "c_desc", textContent: "Beep URL" }, [],
                "td", {}, [
                    "input", { type: "text"
                             , value: def( "http://a.pomf.se/nhmrwe.ogg"
                                         , localStorage["beta-beep-url"]
                                         )
                             , onchange: textify("beta-beep-url")
                             , title: "The source URL of the beep notification "
                                    + "audio file."
                             }, []
                ],
                "td", { className: "c_desc", textContent: "Beep volume" }, [],
                "td", {}, [
                    "input", { type: "range"
                             , min: 0.1
                             , step: 0.1
                             , max: 1.0
                             , value: readify("beta-beep-volume", 0.5)
                             , onchange: textify("beta-beep-volume")
                             }, []
                ]
            ]
        ]
    ])

    var se = ui.querySelectorAll("select")

    for (var i = 0; i < se.length; i++)
        se[i].selectedIndex = readify(se[i].id, defaults[se[i].id])

    main.appendChild(ui)
}

// ignoreUI :: IO ()
function ignoreUI(){
    verb("Creating ignore UI...")
    var main = document.getElementById("main")

    var ui = speedcore("table", {}, [
        "thead", {}, [
            "tr", {}, [
                "th", { colSpan: "3", textContent: "Full user ignoral" }, []
            ]
        ],
        "tbody", {}, [
            "tr", { title: "Hide all of a user's posts by their username" }, [
                "td", { className: "c_desc", textContent: "Users" }, [],
                "td", {}, [
                    "input", { value: readify('beta-ignoredusers', []).join(',')
                             , onchange: modify('beta-ignoredusers')
                             , style: "width: 100%"
                             }, []
                ],
                "td", { textContent: "Comma separated" }, []
            ],
            "tr", { title: "Hide specific posts by their post contents" }, [
                "td", { className: "c_desc", textContent: "Post contents" }, [],
                "td", {}, [
                    "input", { value: readify('beta-ignoredposts', []).join(',')
                             , onchange: modify('beta-ignoredposts')
                             , style: "width: 100%"
                             }, []
                ],
                "td", { textContent: "Comma separated" }, []
            ],
            "tr", { title: "Hide username links everywhere by their IDs" }, [
                "td", { className: "c_desc", textContent: "Global member IDs" }, [],
                "td", {}, [
                    "input", { value: readify('beta-memberids', []).join(',')
                             , onchange: modify('beta-memberids')
                             , style: "width: 100%"
                             }, []
                ],
                "td", { textContent: "Comma separated" }, []
            ]
        ]
    ])

    main.appendChild(ui)
}

// }}}

// beepAudio
function beepAudio() {
    var url = def("http://a.pomf.se/nhmrwe.ogg", localStorage["beta-beep-url"])
      , aud = document.createElement("audio")

    aud.src = url
    aud.volume = readify("beta-beep-volume", 0.5)
    aud.id = "beta-beep"
    aud.name = "beta-beep"
    aud.style.width = "1px"
    aud.style.height = "1px"
    aud.style.visibility = "hidden"

    document.body.appendChild(aud)
}

// addHideButtons :: IO ()
function addHideButton(x) {
    return null
}


// main :: IO ()
function main() {
    verb("BetaBoards!")

    var s = style()

    if (isTopic()) {
        iid = getPage()
        cid = iid

        initEvents()
        remNextButton()
        postNums()
        floatQR()
        hideUserlists()

        quotePyramid(s)

        ignore()

        beepAudio()

        addIgnoredIds(document.querySelectorAll(".ignored"))

        var f = function(){
            pageUpdate()

            loop = setTimeout(f, time)
        }

        var bp = readify('beta-init-load', 2)
          , lp = isLastPage([0, 2, 5, 10, NaN][bp])

        verb("bp " + bp + ", lp: " + lp)

        if (lp || bp === 4) loop = setTimeout(f, time)

    } else if (isPage("post")) {
        addPostEvent()

    } else if (isPage("msg")) {
        try {
            addPostEvent()
        } catch(e) {
            addQuickMsgEvent()
        }

    } else if (isForum()) {
        hideUserlists()

        var f = function(){
            forumUpdate()

            loop = setTimeout(f, time)
        }

        loop = setTimeout(f, time)

    } else if (isHome()) {
        optionsUI()
        ignoreUI()

        // Hint events
        addHintEvents()

    }
}

main()

