const GETDATA = "getData";

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
    let article = document.querySelector( "#jira > div.atlaskit-portal-container > div:nth-child(3) > div > div:nth-child(2) > div > div > section > div > div > div > div > div > div:nth-child(2)" ); // Jira ticket modal
    if( ! article ) {
        // Jira ticket page
        article = document.querySelector( "#ak-main-content > div > div > div > div > div > div > div > div > div" );
    }
    if( ! article ) {
        // Bitbucket pull request changes
        article = document.querySelector( "#main > div > div > div > div > div > div:nth-child(3) > div > div" );
    }
    if( ! article ) {
        // Bitbucket source code
        article = document.querySelector( "#main > div > div > div > div > div" );
    }
    if( ! article ) {
        // Bitbucket pull request
        article = document.querySelector( "#main > div > div > div > div" );
        // #main > div > div > div > div > div > div:nth-child(3) > div
        // #pull-request-tabs-1-tab > div
    }
    if( ! article ) {
        article = document.querySelector( "body" );
    }

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

    // change prompt depending on the page
    let resultData = pageContent;
    if( url.includes( ".atlassian.net/browse" ) || url.includes( ".atlassian.net/jira/" ) ) {
        ( { resultData, prompt } = prepareJiraTicketForOpenAI( pageContent ) );
    }
    if( url.includes( "bitbucket.org/" ) ) {
        if( url.includes( "/pull-request/" ) && url.includes( "/diff#" ) ) {
            ( { resultData, prompt } = prepareBitbucketPullRequestForOpenAI( pageContent ) );
        } else {
            ( { resultData, prompt } = prepareBitbucketPageForOpenAI( pageContent ) );
        }
    }

    // send page content to popup window
    sendResponse( { currentURL: currentPageURL
                , resultData: resultData
                , prompt: prompt } );

    // make asychronous response
    return true;
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