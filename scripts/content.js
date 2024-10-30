const GETDATA = "getData";
const SELECTORS = {
    JIRA: {
        MODAL: "#jira > div.atlaskit-portal-container > div:nth-child(3) > div > div:nth-child(2) > div > div > section > div > div > div > div > div > div:nth-child(2)",
        PAGE: "#ak-main-content > div > div > div > div > div > div > div > div > div"
    },
    BITBUCKET: {
        PR_CHANGES: "#main > div > div > div > div > div > div:nth-child(3) > div > div",
        SOURCE: "#main > div > div > div > div > div",
        PR: "#main > div > div > div > div"
    },
    CONFLUENCE: {
        PAGE: "#content-body > div > div > div > div > div > div:nth-child(3)"
    }
};

const URL_PATTERNS = {
    JIRA: [ ".atlassian.net/browse", ".atlassian.net/jira/" ],
    CONFLUENCE: [ ".atlassian.net/wiki" ],
    BITBUCKET: [ "bitbucket.org/" ]
};

let sfHost, sessionId, flowDefinition, url;

// only add message handlers to 
// iframes that contain relevant information
url = window.location.href;

if( chrome.runtime ) {
    // prime the connection
    chrome.runtime.onConnect.addListener(port => {
        port.onMessage.addListener(msg => {
            console.log( msg );
        });
    });
    // make current window listen to requests from the extension popup window
    chrome.runtime.onMessage.addListener(
        processRequestMessage
    );
}

/////////
// FUNCTIONS
/////////

function processRequestMessage( request, sender, sendResponse ) {
    if( request.message !== GETDATA ) {
        // make asychronous response
        return true;
    }

    // get URL of current page
    let currentPageURL = window.location.href;

    // get article or document node
    let article = getArticleElement();

    // extract all text from document/article
    let textNodes = getChildrenTextNodes( article );
    let pageContent = textNodes.reduce( ( accumulator, currentValue ) => {
        // skip empty lines, lines with only digits
        let theText = currentValue.wholeText.trim();
        if( theText == '\n' || theText == '×' 
                || theText == '' || /^\d+$/.test( theText ) ) {
            return accumulator;
        }
        return accumulator + theText + '\n';
    }, '' );

    let prompt = 'Please briefly explain the following page and make suggestions on how to improve the description or other inforative fields.';

    let resultData = pageContent;

    // change prompt depending on the page
    const pageType = getPageType(url);
    switch(pageType) {
        case 'JIRA':
            ( { resultData, prompt } = prepareJiraTicketForOpenAI(pageContent) );
            break;
        case 'CONFLUENCE':
            ({ resultData, prompt } = prepareConfluencePageForOpenAI(pageContent));
            break;
        case 'BITBUCKET':
            if( url.includes( "/pull-request/" ) && url.includes( "/diff#" ) ) {
                ( { resultData, prompt } = prepareBitbucketPullRequestForOpenAI( pageContent ) );
            } else {
                ( { resultData, prompt } = prepareBitbucketPageForOpenAI( pageContent ) );
            }
            break;
    }

    // send page content to popup window
    sendResponse( { currentURL: currentPageURL
                , resultData: resultData
                , prompt: prompt } );

    // make asychronous response
    return true;
}

function getArticleElement() {
    const selectors = [
        SELECTORS.JIRA.MODAL,
        SELECTORS.JIRA.PAGE,
        SELECTORS.BITBUCKET.PR_CHANGES,
        SELECTORS.BITBUCKET.SOURCE,
        SELECTORS.BITBUCKET.PR,
        SELECTORS.CONFLUENCE.PAGE,
        "body" // fallback
    ];

    return selectors.reduce( ( found, selector ) => 
            found || document.querySelector( selector ), null );
}

function getPageType( url ) {
    if (URL_PATTERNS.JIRA.some(pattern => url.includes(pattern))) {
        return 'JIRA';
    }
    if (URL_PATTERNS.CONFLUENCE.some(pattern => url.includes(pattern))) {
        return 'CONFLUENCE';
    }
    if (URL_PATTERNS.BITBUCKET.some(pattern => url.includes(pattern))) {
        return 'BITBUCKET';
    }
    return 'UNKNOWN';
}

function prepareJiraTicketForOpenAI( ticketData ) {
    let resultData = ticketData.replaceAll( "Add parent", "" ).replaceAll( "Add", "" )
                            .replaceAll( "Edit", "" ).replaceAll( "Delete", "" ).replaceAll( "Show:", "" )
                            .replaceAll( "Newest first", "" );

    return {
        resultData: resultData
        , prompt: 'Please briefly explain the following Jira ticket and make suggestions on how to improve it, what to add to the blank fields.' 
    }
}
function prepareConfluencePageForOpenAI( ticketData ) {
    let resultData = ticketData.replaceAll( "Be the first to add a reaction", "" );

    return {
        resultData: resultData
        , prompt: 'Please briefly explain the following Confluence page and make suggestions on how to improve it or correct it.' 
    }
}

function prepareBitbucketPageForOpenAI( ticketData ) {
    let resultData = ticketData.replaceAll( "source:", "" ).replaceAll( "Select a ref", "" );

    return {
        resultData: resultData
        , prompt: 'Please briefly explain the following source code in BitBucket and make suggestions on how to improve it.' 
    }
}

function prepareBitbucketPullRequestForOpenAI( ticketData ) {
    let resultData = ticketData.replaceAll( "Sort by File tree", "" ).replaceAll( "Comments are hidden.", "" )
                    .replaceAll( "Show comments", "" );

    return {
        resultData: resultData
        , prompt: 'Please briefly explain the following BitBucket pull request, identify potential issues and make suggestions on how to improve it.' 
    }
}

function substringBetween( str, prefix, suffix ) {
    return str.split( prefix ).pop().split( suffix )[ 0 ];
}

function substringExceptBetween( str, prefix, suffix ) {
    return str.replace( substringBetween( str, prefix, suffix ), '' );
}

function getChildrenTextNodes( element ) {
    let treeWalker = document.createTreeWalker( element, NodeFilter.SHOW_TEXT, null, false );
    let nodeArray = [];
    let aNode = treeWalker.nextNode();
    while( aNode ) {
        // skip STYLE/SCRIPT elements
        let parentTag = aNode?.parentNode?.tagName;
        if( parentTag != 'STYLE'
                && parentTag != 'SCRIPT' ) {
            nodeArray.push( aNode );
        }
        aNode = treeWalker.nextNode();
    }
    return nodeArray;
}
