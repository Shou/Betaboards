
// ==UserScript==
// @name            BetaBoards
// @description     It's just like IRC now
// @version         0.5
// @include         http*://*.zetaboards.com/*
// @author          Shou
// @copyright       2013, Shou
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
// - Difference of posts
//      - WIP

// FIXME
// - Name/timestamp <tr> loaded at the bottom of the page several times
//   occasionally.
//      - Seems to have magically fixed itself???
//          - Nope, it's still around.
// - When a post is deleted, the page shifts by one post; incorrect userinfo.
// - OP gets updated every time.
//      - Rather, posts with spoilers update.
//          - Could it be related to the image expanding script? Posts with that
//            are updated.
// - Next page's replies not added when there's only one reply??
// - ciid is -1 and apparently -5 posts are added when it should be 5
// - Attached files are quoted.
// - `lastUserlist' disappears after `genPost' which probably means that a <tr>
//   is overwriting it or something.
// - Background repeat applied even with no-repeat
//      - what???
// - Quick quote doesn't work on some posts.
//      - Event should't be stripped because 'nothing' still happens instead of
//        opening a new tab.

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

var embeds =
    { "vimeo":
        { u: "https?:\\/\\/vimeo\\.com\\/(\\S+)"
        , e: '<iframe src="//player.vimeo.com/video/$1" width="640" height="380" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>'
        , s: "//player.vimeo.com/video/$1"
        }
    , "soundcloud":
        { u: "(https?:\\/\\/soundcloud\\.com\\/\\S+)"
        , e: '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?url=$1"></iframe>'
        , s: "https://w.soundcloud.com/player/?url=$1"
        }
    , "audio":
        { u: "(https?:\\/\\/\\S+?\\.(mp3|ogg))"
        , e: '<audio src="$1" controls width="320" height="32"></audio>' }
        , s: "$1"
    , "video":
        { u: "(https?:\\/\\/\\S+?\\.(ogv|webm|mp4))"
        , e: '<video src="$1" controls muted autoplay loop style="max-width: 640px"></audio>' }
        , s: "$1"
    , "vine":
        { u: "https?:\\/\\/vine.co\\/v\\/([a-zA-Z0-9]+)"
        , e: '<iframe class="vine-embed" src="https://vine.co/v/$1/embed/simple" width="480" height="480" frameborder="0"></iframe><script async src="//platform.vine.co/static/scripts/embed.js" charset="utf-8"></script>'
        , s: "https://vine.co/v/$1/embed/simple"
        }
    }

// }}}

// {{{ Debug

var verbose = true
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

// fromBBCode :: Elem -> String
function fromBBCode(e) {
    e.innerHTML = e.innerHTML.replace(/<br>/g, "\n")

    var srcs = { "img": "[img]%s[/img]", "iframe": "%s" }
    var wraps = { "strong": "b", "em": "i", "u": "u", "sup": "sup"
                , "sub": "sub"
                }

    for (var t in srcs) {
        var es = e.getElementsByTagName(t)
        for (var i = 0; i < es.length; i++)
            es[i].textContent = src[t].replace(/%s/g, es[i].src)
    }

    for (var t in wraps) {
        var es = e.getElementsByTagName(t)
        for (var i = 0; i < es.length; i++)
            es[i].textContent = "[" + wraps[t] + "]"
                              + es[i].textContent
                              + "[/" + wraps[t] + "]"
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

    posting = true

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

            posting = false

        } else if (xhr.readyState === 4) posting = false

        else debu(xhr)
    }

    // timeout posting
    setTimeout(function(){ posting = false }, 10000)

    // Don't post if it's empty.
    if (str.length > 0) {
        xhr.open("POST", url, true)
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded")
        xhr.send(args)

    } else verb("Empty reply.")
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

// XXX deleted post removal working?
// addPosts :: String -> IO ()
function addPosts(html) {
    verb("Initiating addPosts...")

    try {

    var par = new DOMParser()
      , doc = par.parseFromString(html, "text/html")
      // Old and new posts
      , oids = document.querySelectorAll("tr[id^='post-']")
      , nids = doc.querySelectorAll("tr[id^='post-']")
      // Old and new userlists
      , ous = document.querySelector(".c_view")
      , nus = doc.querySelector(".c_view")
      // t_viewer body
      , tvib = document.querySelector("#topic_viewer > tbody")
      // oids without previous pages; newly old IDs
      , noids = oids.slice(Math.floor(oids.length / 25) * 25)

    verb( "oids: " + oids.length + ", nids: " + nids.length + ", noids: "
        + noids.length
        )

    // Replace userlist
    ous.parentNode.replaceChild(nus, ous)

    // TODO generalize code
    // New posts, removed posts and equal posts
    var newps = nids.mapDiff(function(e) { return e.id }, oids)
      , remps = noids.mapDiff(function(e) { return e.id }, nids)
      , oldps = nids.mapInter(function(e) { return e.id }, oids)

    // Remove deleted posts
    verb("Removed posts: " + remps.length)
    remps.map(function(e) {
        // TODO generalize code
        var es = [ e, e.nextElementSibling
                 , e.nextElementSibling.nextElementSibling
                 , e.nextElementSibling.nextElementSibling.nextElementSibling
                 , e.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling
                 ]

        // TODO remove only DELETED posts
        //          should work now???
        for (var i = 0; i < 5; i++) {
            tvib.removeChild(e)
        }
    })

    // Add new posts
    verb("New posts: " + newps.length)
    newps.map(function(e) {
        // TODO generalize code
        var es = [ e, e.nextElementSibling
                 , e.nextElementSibling.nextElementSibling
                 , e.nextElementSibling.nextElementSibling.nextElementSibling
                 , e.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling
                 ]

        for (var i = 0; i < 5; i++) {
            tvib.insertBefore(es[i], tvib.querySelector(".c_view").parentNode)

            // Add spoiler event
            if (i == 1) addSpoilerEvent(es[i])

            // Add quick quote event
            if (i === 3) addQuoteEvent(es[i])
        }
    })

    // Update time before update detecting
    if (newps.length > 0 || remps.length > 0) time = 10000
    else time = Math.min(160000, Math.floor(time * 1.5))

    // Update old posts
    verb("Old posts: " + oldps.length)
    oldps.map(function(e) {
        var eq = document.querySelector('#' + e.id)
        // Replace timestamp
        eq.parentNode.replaceChild(e, eq)

        updatePost(e, eq)
    })

    octave()

    // TODO test against deleted posts, might get stuck on page from < 25 posts
    // Switch to new page
    cid = iid + Math.floor(oids.length / 25)

    } catch(e) { debu(e.toString()) }
}

// TODO generalize the SHIT out of this you B I T C H
// updatePost :: Elem -> Elem -> IO ()
function updatePost(ne, oe) {
    var coe = oe.childNodes
      , cne = ne.childNodes
      , changed = false

    for (var i = 0; i < cne.length; i++) {
        if (coe[i] === null) oe.appendChild(ne.childNodes[i])

        else if ( cne[i].constructor === Text
              && coe[i].constructor === Text
              && coe[i].textContent !== cne[i].textContent) {

            coe[i].textContent = cne[i].textContent

            changed = true

        } else if ( cne[i].constructor === HTMLAnchorElement
               && coe[i].constructor === HTMLAnchorElement
               && cne[i].tagName === coe[i].tagName) {

            if (cne[i].tagName === "OBJECT") {
                if (cne[i].data !== coe[i].data) {
                    coe[i].data = cne[i].data

                    changed = true
                }

            } else if (cne[i].tagName === "IMG") {
                if (cne[i].src !== coe[i].src) {
                    coe[i].src = cne[i].src

                    changed = true
                }
            }

        } else if ( cne[i].constructor === HTMLAnchorElement
                 && coe[i].constructor === HTMLAnchorElement) {

            if (coe[i].tagName === "IFRAME") {

            } else if (coe[i].tagName === "VIDEO"
                    || coe[i].tagName === "AUDIO") {

                if (coe[i].src !== cne[i].href) {
                    coe[i].src = cne[i].href

                    changed = true
                }
            }

        } else {
            oe.replaceChild(ne.childNodes[i], oe.childNodes[i])

            changed = true
        }
    }

    if (changed) time = 10000

    } catch(e) { debu(e.toString()) }
}

// addPostsOld :: String -> IO ()
function addPostsOld(html){
    // Scroll height before inserting
    var oldscroll = document.body.scrollHeight
    var dom = lastUserlist()
    var focused = document.activeElement.name === "post"
    var d = insert(html)
    var xs = focus(d)
    var trs = init(xs)
    if (d.querySelector(".topic").querySelector(".btn_mod") !== null)
        trs = init(trs)
    var us = d.querySelector(".c_view").parentNode

    verb(us)

    verb("Loaded " + Math.round(trs.length / 5) + " replies")

    // There is at least one reply
    try {
        if (trs.length >= 5) {
            var p = dom.parentNode
            genPost(dom, trs, cid)
            // Replace old userlist
            p.replaceChild(us, dom)

            if (trs.length >= 25 * 5) {
                // Increment page
                cid++
                // update pages buttons
                //pagesUpdate()
                // we don't want the reply length from the old page.
                old = 0
            }

            // New replies were found
            if (old < trs.length) time = 6667
            old = trs.length

        } else cid--

        // High octave sexual moaning
        octave()

    } catch(e){ debu(e) }

    // Remove loaded HTML
    d.parentNode.removeChild(d)
    // Focus textarea
    if (focused) quickReply().focus()
    // Scroll to first new post
    autoScroll(oldscroll, scrollid)
    // Reset scroll ID
    scrollid = null
    // Set time
    time = Math.min(160000, Math.floor(time * 1.5))
    // ignore!
    ignore()
    // Remove post numbers!
    postNums()

    verb("Set time to " + time)
}

// addTopics :: String -> IO ()
function addTopics(html){
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

// TODO
// | Update page numbers at the top/bottom.
// pagesUpdate :: IO ()
function pagesUpdate(){
    var ps = document.getElementsByClassName("cat-pages")
    var es = []

    verb("Finding current page element...")

    // Only the first two or less "cat-pages" elements.
    for (var i = 0; i < Math.min(ps.length, 2); i++) {
        var ns = ps[i].children
        var b = false

        for (var j = 0; j < ns.length; j++) {
            try {
                if (ns[j].className === "cat-pagesjump") b = true
                else if (ns[j].children[0].rel === undefined) es.push(ns[j])
                else if (b) ns[j].parentNode.removeChild(ns[j])
            } catch(e) {}
        }
    }

    if (es.length > 0) {
        for (var i = 0; i < es.length; i++) {
            var e = es[i]
            var s = document.createElement("span")
            var li = document.createElement("li")
            s.appendChild(li)

            try {
                var p = e.nextElementSibling.children[0]
                li.textContent = p.textContent
                e.parentNode.replaceChild(s, p)
                verb("Edited page sibling")

            } catch(e) {
                verb("No page sibling")
                // FIXME e.children is undefined
                e.children[0].textContent = parseInt(e.children[0].textContent) + 1
                e.parentNode.appendChild(s)
            }
        }

    } else if (ps.length < 1) {
        var p = speedcore("ul", { className: "cat-pages" }, [
            "li", { className: "cat-pageshead", textContent: "Pages:" }, [],
            "li", {}, [
            ]
        ])

    } else {
        verb("No current page found")
    }
}

// insert :: String -> IO Elem
function insert(html){
    var e = document.createElement("div")
    document.body.appendChild(e)
    e.innerHTML = html

    return e
}

// TODO
//  - Actually make post editing work.
//      - For other things than text too.
// FIXME
//  - When `(trs.length + n - itrs.length) / 5` is -1, page implodes.
//  - "Updating post n" off by -1
// genPost :: Elem -> [Elem] -> IO ()
function genPost(dom, trs) {
    var itrs = inittrs()
    var p = cid - iid
    var n = p * 125

    verb("Adding "
        + Math.round((trs.length + n - itrs.length) / 5)
        + " posts..."
        )
    debu( "ciid: " + p + "; trs: " + trs.length + "; itrs: " + itrs.length
        + "; n: " + n
        )

    for (var i = n; i < trs.length + n; i++) {
        try {
            // Update timestamp
            if (i % 5 == 0) itrs[i].parentNode.replaceChild(trs[i % 125], itrs[i])
            // Update contents of edited posts
            else if (i % 5 == 1) {
                var ip = itrs[i].children[1]
                var tp = trs[i % 125].children[1]
                var cip = ip.cloneNode(true)
                var ctp = tp.cloneNode(true)

                var as = cip.getElementsByClassName("spoiler")
                var bs = ctp.getElementsByClassName("spoiler")

                // XXX what???
                for (var j = 0; j < as.length; j++) {
                    try { bs[j].style = "" }
                    catch(e) {}
                    try { as[j].style = "" }
                    catch(e) {}
                }

                var changed = false
                var ccip = cip.childNodes
                var cctp = ctp.childNodes

                // TODO remove try-catch
                try {
                for (var ii = 0; ii < ccip.length; ii++) {
                    if (tp.childNodes[ii] === undefined) verb("no cctp")

                    else if (cctp[ii].className === "editby")
                        ip.replaceChild(tp.childNodes[ii], ip.childNodes[ii])

                    // skip certain elements for now
                    // TODO make them update on src changes
                    else if (ccip[ii].tagName.indexOf(["IFRAME", "OBJECT"])) {
                        continue

                    } else if (ccip[ii].textContent !== cctp[ii].textContent) {
                        verb("ip " + ii)
                        verb(ip.childNodes)
                        verb("tp " + ii)
                        verb(tp.childNodes)

                        ip.replaceChild(tp.childNodes[ii], ip.childNodes[ii])

                        verb("Updated post " + Math.round(i / 5))

                        changed = true
                    }
                }
                } catch(e) { debu(e.toString()) }

                verb("cctp len " + cctp.length)
                verb("ccip len " + ccip.length)
                for (var l = 0; l < cctp.length - ccip.length; l++) {
                    verb( "adding to post " + Math.round(i / 5) + ", "
                        + (ccip.length + l) + " / " + cctp.length
                        )
                    verb(tp.childNodes[ccip.length + l])
                    ip.appendChild(tp.childNodes[ccip.length + l])

                    changed = true
                }

                var k = 0
                var kl = ccip.length - cctp.length

                while (k < kl) {
                    // Ignore edit divs and re-add whitespace accompanier
                    if (ccip[ccip.length - k - 1].className === "editby") {
                        kl++

                    } else {
                        verb( "removing from post " + Math.round(i / 5) + ", "
                            + (ccip.length - k - 1) + " / " + (ccip.length - 1)
                            )
                        verb(ip.childNodes[ccip.length - k - 1])
                        ip.removeChild(ip.childNodes[ccip.length - k - 1])

                        changed = true
                    }

                    k++
                }

                if (changed) {
                    time = 6667

                    // TODO
                    //addSpoilerEvent(ip.parentNode)
                }

            // Intentionally explodes on new elements
            } else itrs[i].parentNode

        } catch(e) {
            debu(e)

            if (i % 5 === 0) {
                if (scrollid === null) scrollid = trs[i % 125].id
            }

            verb("LEL!!!")
            var lul = lastUserlist()

            verb(lul)

            tbody().insertBefore(trs[i % 125], lul)

            // Add broken events
            if (i % 5 == 1) {
                //addSpoilerEvent(trs[i % 125])

            } else if (i % 5 == 3) {
                //addQuoteEvent(trs[i % 125])
            }
        }
    }
}

// remNextButton :: IO ()
function remNextButton(){
    var ns = document.getElementsByClassName("c_next")
    map(function(n){ n.parentNode.parentNode.removeChild(n.parentNode) }, ns)
}

// postNums :: IO ()
function postNums(){
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
function getPostArgs(t){
    var ts = t.parentNode.parentNode.parentNode.getElementsByTagName("input")
    var o = {}

    for (var i = 0; i < ts.length; i++)
        if (ts[i].type === "hidden") o[ts[i].name] = ts[i].value

    o["sd"] = '1'

    return o
}

// | Highlight the elements that have actions during Ctrl mode.
// highlightModeElems :: Bool -> IO ()
function highlightModeElems(b){
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
function hideUserlists(){
    if (readify('beta-userlist', false)) {
        debu("Hiding userlists!")
        var s = document.createElement("style")
        s.id = "beta-style-userlist"

        s.textContent = ".c_view-list { display: none !important } "

        document.body.appendChild(s)
    }
}

// toggleFloatingQR :: IO ()
function toggleFloatingQR(){
    if (localStorage["beta-floating"]) delete localStorage["beta-floating"]
    else localStorage["beta-floating"] = '1'

    floatQR()
}

// floatQR :: IO ()
function floatQR(){
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
}

// moveQR :: Event -> IO ()
function moveQR(e){
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

// }}}

// {{{ Events

// | Add the initial events.
// initEvents :: IO ()
function initEvents(){
    verb("Making init events...")
    var qr = quickReply()

    qr.className += " beta-highlight"

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
    qr.addEventListener("click", function(e){
        if (e.ctrlKey && e.button === 0) toggleFloatingQR()
    })

    // Quote events
    var trs = inittrs()
    for (var i = 0; i < trs.length; i++)
        if (i % 5 == 3) addQuoteEvent(trs[i])
}

// addSpoilerEvent :: Elem -> IO ()
function addSpoilerEvent(tr){
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
function addQuoteEvent(tr){
    var rs = tr.children[1].children[1].children
    var q = rs[rs.length - 2]
    q.className += " beta-highlight"

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
            // are u kidding me m8
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
function addPostEvent(){
    var pt = document.querySelector("#c_post-text")

    pt.addEventListener("keydown", function(e){
        if (e.ctrlKey && e.keyCode === 13) {
            var pf = document.querySelector(".exclusivebutton")

            pf.submit()
        }
    })
}

// addQuickMsgEvent :: IO ()
function addQuickMsgEvent(){
    var qt = document.querySelector("#quickcompose")

    qt.addEventListener("keydown", function(e){
        if (e.ctrlKey && e.keyCode === 13) {
            var pf = document.querySelector(".exclusivebutton")

            pf.submit()
        }
    })
}

// | Scroll to the latest post.
// autoScroll :: Int -> String -> IO ()
function autoScroll(os, id){
    var scrolled = window.scrollY + window.innerHeight
    var offset = os - scrolled


    if (offset >= 500) ascroll = false
    else if ((offset < 500 || ascroll) && id !== undefined) {
        verb("Scrolling to post " + id)

        ascroll = true

        window.location.href = window.location.pathname + '#' + id

    } else if (id === undefined) verb("ID is undefined.")
}

// }}}

// {{{ Zeta

// getPage :: IO Int
function getPage(){
    var url = window.location.pathname.split('/')

    return parseInt(url[url.length - 2])
}

// getId :: IO String
function getId(){
    var url = window.location.pathname.split('/')

    return url[url.length - 3]
}

// getURL :: IO String
function getURL(){
    var url = window.location.pathname.split('/').slice(0, 4).join('/')

    return url + '/' + cid + '/'
}

// getForum :: IO String
function getForum(){
    var url = window.location.pathname.split('/')

    return url[1]
}

// isForum :: IO Bool
function isForum(){
    var url = window.location.pathname.split('/')

    return url[2] === "forum"
}


// isTopic :: IO Bool
function isTopic(){
    var url = window.location.pathname.split('/')

    return url[2] === "topic"
}

// isHome :: IO Bool
function isHome(){
    var url = window.location.pathname.split('/')

    verb("isHome: " + url[2] === "home")
    return url[2] === "home"
}

// isPost :: IO Bool
function isPost(){
    var url = window.location.pathname.split('/')

    verb("isPost: " + url[2] === "post")
    return url[2] === "post"
}

// isPage :: IO Bool
function isPage(s){
    var url = window.location.pathname.split('/')

    verb("isPost: " + url[2] === s)
    return url[2] === s
}

// }}}

// {{{ High octave sexual moaning

// replacer :: String -> String
function replacer(x){
    var y = x

    for (var k in embeds) {
        var m = x.match(RegExp(embeds[k].u, 'g'))

        if (m) log(m.join(', '))
        x = x.replace(RegExp(embeds[k].u, 'g'), embeds[k].e)
    }

    return x
}

function high(e){
    var as = e.getElementsByTagName("a")

    // each link
    for (var j = 0; j < as.length; j++)
        try {
            var ass = as[j]
            var rd = replacer(ass.href)

            if (rd !== ass.href) ass.outerHTML = rd

        } catch(e) {
            log(e.toString())
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
function pageUpdate(){
    var b = readify('beta-loading', false)

    if (! b) {
        console.log(cid)

        try {
            var url = getURL()
            console.log(url)
            request(url, addPosts)

        } catch(e) {
            debu(e)
        }
    }
}

// forumUpdate :: IO ()
function forumUpdate(){
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
    css += " { display: none !important }"
    e.innerHTML = css

    document.body.appendChild(e)

    return e
}

// ignoredUsers :: IO [String]
function ignoredUsers(){
    try {
        return JSON.parse(localStorage['beta-ignoredusers'])

    } catch(e){
        debu(e.toString())
        return []
    }
}

// ignoredPosts :: IO Regex
function ignoredPosts(){
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

// modifiy :: String -> (IO ())
function modify(k){ return function(){
    localStorage[k] = JSON.stringify(this.value.split(','))
}}

// readify :: String -> [a]
function readify(k, a){
    try { return JSON.parse(localStorage[k])
    } catch(e) {
        debu(e.toString())
        return a
    }
}

// togglify :: IO ()
function togglify(k){ return function(){
    if (this.checked) localStorage[k] = this.checked
    else delete localStorage[k]
}}

// optionsUI :: IO ()
function optionsUI(){
    verb("Creating options UI...")
    var main = document.getElementById("main")

    var ui = speedcore("table", {}, [
        "thead", {}, [
            "tr", {}, [
                "th", { colSpan: "3", textContent: "Settings" }, []
            ]
        ],
        "tbody", {}, [
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable reply loading" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-loading', false)
                             , onchange: togglify('beta-loading')
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable topic refreshing" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-refreshing', false)
                             , onchange: togglify('beta-refreshing')
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable ignoring" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-ignoring', false)
                             , onchange: togglify('beta-ignoring')
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Disable quote collapsing" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-quotes', false)
                             , onchange: togglify('beta-quotes')
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Hide post numbers" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-postnums', false)
                             , onchange: togglify('beta-postnums')
                             }, []
                ]
            ],
            "tr", {}, [
                "td", { className: "c_desc", textContent: "Hide userlist" }, [],
                "td", {}, [
                    "input", { type: "checkbox"
                             , checked: readify('beta-userlist', false)
                             , onchange: togglify('beta-userlist')
                             }, []
                ]
            ]
        ]
    ])

    main.appendChild(ui)
}

// ignoreUI :: IO ()
function ignoreUI(){
    verb("Creating ignore UI...")
    var main = document.getElementById("main")

    var ui = speedcore("table", {}, [
        "thead", {}, [
            "tr", {}, [
                "th", { colSpan: "3", textContent: "Ignore users" }, []
            ]
        ],
        "tbody", {}, [
            "tr", { title: "All of a user's posts by their usernames" }, [
                "td", { className: "c_desc", textContent: "Users" }, [],
                "td", {}, [
                    "input", { value: readify('beta-ignoredusers', []).join(',')
                             , onchange: modify('beta-ignoredusers')
                             , style: "width: 100%"
                             }, []
                ],
                "td", { textContent: "Comma separated" }, []
            ],
            "tr", { title: "Specific posts by their post contents" }, [
                "td", { className: "c_desc", textContent: "Post contents" }, [],
                "td", {}, [
                    "input", { value: readify('beta-ignoredposts', []).join(',')
                             , onchange: modify('beta-ignoredposts')
                             , style: "width: 100%"
                             }, []
                ],
                "td", { textContent: "Comma separated" }, []
            ],
            "tr", { title: "Username links everywhere" }, [
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

// addHideButtons :: IO ()
function addHideButton(x){
    return null
}


// main :: IO ()
function main(){
    verb("BetaBoards!")

    var s = style()

    if (isTopic()) {
        iid = getPage()
        cid = iid
        old = inittrs().length

        initEvents()
        remNextButton()
        postNums()
        floatQR()
        hideUserlists()

        quotePyramid(s)

        ignore()

        var f = function(){
            pageUpdate()

            loop = setTimeout(f, time)
        }

        loop = setTimeout(f, time)

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

    }
}

main()

