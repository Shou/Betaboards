// ==UserScript==
// @name            BetaBoards
// @description     It's just like IRC now
// @version         0.4.4
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

// FIXME
// - Name/timestamp <tr> loaded at the bottom of the page several times
//   occasionally.
//      - Seems to have magically fixed itself???
//          - Nope, it's still around.
// - When a post is deleted, the page will fuck up... maybe.
// - OP gets updated every time.
//      - Rather, posts with spoilers update.
//          - Could it be related to the image expanding script? Posts with that
//            are updated.
// - Ctrl-mode active when Ctrl-key not held down.
//      - Fixed????
// - Next page's replies not added when there's only one reply??
// - ciid is -1 and apparently -5 posts are added when it should be 5
// - Pseudo-quoting doesn't keep bold, italic, spoilers, etc
//      - Attached files are quoted.
// - `lastUserlist' disappears after `genPost' which probably means that a <tr>
//   is overwriting it or something.

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
function init(xs){
    var tmp = []
    for (var i = 0; i < xs.length - 1; i++) tmp.push(xs[i])
    return tmp
}

// | All but the first element of a list.
// tail :: [a] -> [a]
function tail(xs){
    var tmp = []
    for (var i = 1; i < xs.length; i++) tmp.push(xs[i])
    return tmp
}

// | Last element of a list.
// last :: [a] -> a
function last(xs){
    return xs[xs.length - 1]
}

// map :: (a -> b) -> [a] -> [b]
function map(f, xs){
    var tmp = []
    for (var i = 0; i < xs.length; i++) tmp.push(f(xs[i]))
    return tmp
}

// | No more Flydom!
// speedcore :: String -> Obj -> Tree -> Elem
function speedcore(tagname, attrs, childs){
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
function fromBBCode(e){
    e.innerHTML = e.innerHTML.replace(/<br>/g, "\n")
//    var is = e.getElementsByTagName("img")
//    for (var i = 0; i < is.length; i++)
//        is[i].textContent = "[img]" + is[i].src + "[/img]"
    return e.textContent
}

// def :: a -> a -> a
function def(x, y){
    if (y) return y
    else return x
}

// }}}

// {{{ XHR

// request :: String -> IO ()
function request(url, f){
    var xhr = new XMLHttpRequest()

    xhr.timeout = 10000
    xhr.onreadystatechange = function(){
        if (xhr.readyState === 4 && xhr.status === 200) {
            f(xhr.responseText)
        }

        else debu(xhr)
    }

    xhr.open("GET", url, true)
    xhr.send()
}

// reply :: Elem -> IO ()
function reply(t){
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
            addPosts(xhr.responseText)
            t.value = ""

            posting = false

        } else if (xhr.readyState === 4) posting = false

        else debu(xhr)
    }

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
    var es = tbody().children

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
    var fts = document.getElementById("main").getElementsByClassName("c_view")
    var ft = fts[fts.length - 1]
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

// addPosts :: String -> IO ()
function addPosts(html){
    // Scroll height before inserting
    var oldscroll = document.body.scrollHeight
    var dom = lastUserlist()
    var focused = document.activeElement.name === "post"
    var d = insert(html)
    var xs = focus(d)
    var trs = init(xs)
    var us = last(xs)

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
                break // down on the floor!!!

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

// genPost :: Elem -> [Elem] -> IO ()
function genPost(dom, trs){
    var itrs = inittrs()
    var p = cid - iid
    var n = p * 125

    verb("Adding "
        + Math.round((trs.length + n - itrs.length) / 5)
        + " posts..."
        )
    debu("ciid: " + p + "; trs: " + trs.length + "; itrs: " + itrs.length)

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

                var xs = cip.getElementsByClassName("editby")
                var ys = ctp.getElementsByClassName("editby")

                for (var j = 0; j < xs.length; j++) {
                    try { ctp.removeChild(xs[j]) }
                    catch(e) {}
                    try { cip.removeChild(ys[j]) }
                    catch(e) {}
                }

                var as = cip.getElementsByClassName("spoiler")
                var bs = ctp.getElementsByClassName("spoiler")

                for (var j = 0; j < as.length; j++) {
                    try { bs[j].style = "" }
                    catch(e) {}
                    try { as[j].style = "" }
                    catch(e) {}
                }

                if (cip.innerHTML !== ctp.innerHTML) {
                    verb("Updating post " + Math.round(i / 5))
                    ip.innerHTML = tp.innerHTML

                    addSpoilerEvent(ip.parentNode)

                }

            // Intentionally explodes on new elements
            } else itrs[i].parentNode

        } catch(e) {
            if (i % 5 == 0) {
                debu(e)
                if (scrollid === null) scrollid = trs[i % 125].id
            }
            tbody().insertBefore(trs[i % 125], lastUserlist())

            // Add broken events
            if (i % 5 == 1) {
                addSpoilerEvent(trs[i % 125])

            } else if (i % 5 == 3) {
                addQuoteEvent(trs[i % 125])
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
        var rs = document.getElementsByClassName("right")

        for (var i = 0; i < rs.length; i++) {
            debu("Post nums! " + i)
            try {
            rs[i].children[0].textContent = "Post link"
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
            s.display = s.display == "" ? "none" : ""
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

// }}}

// pageUpdate :: IO ()
function pageUpdate(){
    var b = readify('beta-updating', false)

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

// style :: IO ()
function style(){
    verb("Styling...")
    var e = document.createElement("style")
    var css = ""
    var csss = []

    var ids = []
    try { ids = JSON.parse(localStorage['beta-memberids']) }
    catch(e) { debu(e) }

    for (var i = 0; i < ids.length; i++)
        csss.push("a[href*=\"" + ids[i] + "\"]")

    css = csss.join(',')
    css += " { display: none !important }"
    e.innerHTML = css

    document.body.appendChild(e)
}

// ignoredUsers :: IO [String]
function ignoredUsers(){
    try {
        return JSON.parse(localStorage['beta-ignoredusers'])

    } catch(e){
        debu(e)
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
        debu(e)
    }

    for (var i = 0; i < ms.length; i++){
        re += "" + ms[i] + ""
        if (i < ms.length - 1) re += '|'
    }

    verb(re)

    if (re.length > 0) return new RegExp(re, "i")
    else return new RegExp(null, "i")
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

                } else if (usernamePost(us[i]).textContent.match(posts)) {
                    verb("Ignoring post of " + uname)
                    var e = us[i].parentNode
                    e.style.display = "none"
                    e.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.style.display = "none"
                    e.nextElementSibling.nextElementSibling.nextElementSibling.style.display = "none"
                }

            } catch(e) {
                debu(e)
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
        debu(e)
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


// main :: IO ()
function main(){
    verb("BetaBoards!")

    if (isTopic()) {
        iid = getPage()
        cid = iid
        old = inittrs().length

        initEvents()
        remNextButton()
        postNums()
        floatQR()
        hideUserlists()

        ignore()

        var f = function(){
            pageUpdate()

            loop = setTimeout(f, time)
        }

        loop = setTimeout(f, time)

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

    style()
}

main()

