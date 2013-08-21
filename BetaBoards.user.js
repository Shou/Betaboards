// ==UserScript==
// @name            BetaBoards
// @description     It's just like IRC now
// @version         0
// @include         http*://*.zetaboards.com/*/topic/*
// @author          Shou
// @copyright       2013, Shou
// @license         MIT
// ==/UserScript==


// XXX:
// - Will time and xhr.timeout conflict?

// TODO:
// - Replace the contents of updated posts.
//      - Group <tr>s in five and compare the contents of the ".c_post"s
// - Clean up script.

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

// }}}


// request :: String -> IO ()
function request(url){
    var xhr = new XMLHttpRequest()

    xhr.timeout = 10000
    xhr.onreadystatechange = function(){
        if (xhr.readyState === 4 && xhr.status === 200) {
            addPosts(xhr.responseText)
        }

        else debu(xhr)
    }

    xhr.open("GET", url, true)
    xhr.send()
}

// addPosts :: String -> IO ()
function addPosts(html){
    var dom = lastUserlist()
    var d = insert(html)
    var xs = focus(d)
    var trs = init(xs)
    var us = last(xs)

    verb("Loaded " + Math.round(trs.length / 5) + " replies")

    // There is at least one reply
    if (trs.length >= 5) {
        genPost(dom, trs, cid)
        // Replace old userlist
        dom.parentNode.replaceChild(us, dom)

        if (trs.length >= 25 * 5) {
            // Increment page
            cid++
            // update pages buttons
            pagesUpdate()
            // we don't want the reply length from the old page.
            old = 0
        }

        // New replies were found
        if (old < trs.length) time = 6667
        old = trs.length

    } else cid--

    d.parentNode.removeChild(d)
    time = Math.min(160000, Math.floor(time * 1.5))
    verb("Set time to " + time)
}

// | Get the tbody containing post <tr>s
// tbody :: IO ()
function tbody(){
    var e = document.getElementById("main").getElementsByClassName("topic")[0]

    return e.children[1]
}

// | Update page numbers at the top/bottom.
// pagesUpdate :: IO ()
function pagesUpdate(){
    var ps = document.getElementsByClassName("cat-pages")
    var es = []

    verb("Finding current page element...")

    for (var i = 0; i < 2; i++) {
        var ns = ps[i].children

        for (var j = 0; j < ns.length; j++) {
            try {
                if (ns[j].className === "cat-pagesjump");
                else if (ns[j].children[0].rel === undefined) es.push(ns[j])
            } catch(e) {}
        }
    }

    if (es.length > 0) {
        for (var i = 0; i < es.length; i++) {
            var e = es[i]
            var s = document.createElement("span")

            if (e.nextElementSibling) {
                verb("Editing page sibling")
                var p = e.nextElementSibling.children[0]
                s.textContent = p.textContent
                e.parentNode.replaceChild(s, p)

            } else {
                verb("No page sibling")
                s.textContent = parseInt(e.children[0].textContent) + 1
                e.parentNode.appendChild(s)
            }
        }

    } else {
        verb("No current page found")
    }
}

// | Get original <tr>s
// inittrs :: IO Int
function inittrs(){
    var es = tbody().children

    return init(tail(es))
}

// | Find the post table rows and return them.
// focus :: DOMObj -> IO [DOMObj]
function focus(div){
    var e = div.getElementsByClassName("topic")[0]

    if (e) {
        var es = e.children[1].children

        return tail(es)

    } else return []
}

// | Get the class="c_view" element.
// lastUserlist :: IO DOMObj
function lastUserlist(){
    var fts = document.getElementById("main").getElementsByClassName("c_view")
    var ft = fts[fts.length - 1]
    var ftl = ft.parentNode

    return ftl
}

// insert :: String -> IO DOMObj
function insert(html){
    var e = document.createElement("div")
    document.body.appendChild(e)
    e.innerHTML = html

    return e
}

// genPost :: DOMObj -> [DOMObj] -> IO ()
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
            if (i % 5 == 0) itrs[i].parentNode.replaceChild(trs[i % 125], itrs[i])
            else itrs[i].parentNode

        } catch(e) {
            tbody().insertBefore(trs[i % 125], lastUserlist())
        }

        // Add broken events
        if (i % 5 == 1) {
            var sps = trs[i % 125].getElementsByClassName("spoiler_toggle")

            if (sps.length > 0)
                verb("Adding " + sps.length + " spoiler events for post "
                    + Math.ceil(i / 5) + "..."
                    )

            for (var j = 0; j < sps.length; j++) {
                sps[j].addEventListener("click", function(){
                    var s = this.nextElementSibling.style
                    s.display = s.display == "" ? "none" : ""
                })
            }
        }
    }
}

// remNextButton :: IO ()
function remNextButton(){
    var ns = document.getElementsByClassName("c_next")

    for (var i = 0; i < ns.length; i++)
        ns.parentNode.parentNode.removeChild(ns.parentNode)
}

// getID :: IO Int
function getID(){
    var url = window.location.pathname.split('/')

    return parseInt(url[url.length - 2])
}

// getURL :: IO String
function getURL(){
    var url = window.location.pathname.split('/').slice(0, 4).join('/')

    return url + '/' + cid + '/'
}

// main :: IO ()
function main(){
    iid = getID()
    cid = iid
    old = inittrs().length

    // Remove next page buttons
    remNextButton()

    var f = function(){
        console.log(cid)

        try {
            var url = getURL()
            console.log(url)
            request(url)
        } catch(e) {}

        loop = setTimeout(f, time)
    }
    loop = setTimeout(f, time)
}

main()

