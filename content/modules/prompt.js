/**
 * @fileOverview
 * @name prompt.js
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

KeySnail.Prompt = {
    // ==== common ====
    modules: null,

    // DOM Objects
    promptbox: null,
    label: null,
    textbox: null,

    // Callbacks
    currentCallback: null,
    currentUserArg: null,

    savedFocusedElement: null,

    // Options
    substrMatch: true,

    currentHead: null,
    // compIndex: null,
    // compIndexList: null,
    inNormalCompletion: false,

    // History
    historyHolder: null,
    history: {
        list: null,
        index: 0,
        state: false,
        name: "History"
    },

    // Completion
    completion : {
        list: null,
        index: 0,
        state: false,
        name: "Completion"
    },

    init: function () {
        if (KeySnail.windowType == "navigator:browser") {
            this.promptbox = document.getElementById("keysnail-prompt");
            this.label     = document.getElementById("keysnail-prompt-label");
            this.textbox   = document.getElementById("keysnail-prompt-textbox");

            // this holds all history and 
            this.historyHolder = new Object;
            this.historyHolder["default"] = [];
        }
    },

    handleEvent: function (aEvent) {

        switch (aEvent.type) {
        case 'keypress':
            this.handleKeyPress(aEvent);
            break;
        case 'keydown':
            this.handleKeyDown(aEvent);
            break;
        case 'blur':
            this.onBlur();
            break;
        }
    },

    onBlur: function () {
        this.finish(true);
    },

    handleKeyDown: function (aEvent) {
        // Some KeyPress event is grabbed by KeySnail and stopped.
        // So we need to listen the keydown event for resetting the misc values.
        switch (aEvent.keyCode) {
        case KeyEvent.DOM_VK_TAB:
        case KeyEvent.DOM_VK_SHIFT:
            break;
        default:
            this.currentHead = null;
            this.inNormalCompletion = false;
            break;
        }        
    },

    handleKeyPress: function (aEvent) {
        switch (aEvent.keyCode) {
        case KeyEvent.DOM_VK_ESCAPE:
            this.finish(true);
            break;
        case KeyEvent.DOM_VK_RETURN:
        case KeyEvent.DOM_VK_ENTER:
            this.finish();
            break;
        case KeyEvent.DOM_VK_UP:
            if (this.history.state) {
                this.fetchItem(this.history, 1);
            } else {
                this.fetchItem(this.history, 0);
                this.history.state = true;
            }
            // reset completion index
            this.resetState(this.completion);
            break;
        case KeyEvent.DOM_VK_DOWN:
            if (this.history.state) {
                this.fetchItem(this.history, -1);
            } else {
                this.fetchItem(this.history, 0);
                this.history.state = true;
            }
            // reset completion index
            this.resetState(this.completion);
            break;
        case KeyEvent.DOM_VK_TAB:
            this.modules.util.stopEventPropagation(aEvent);
            if (this.completion.state) {
                this.fetchItem(this.completion, aEvent.shiftKey ? -1 : 1, true, true);
            } else {
                this.fetchItem(this.completion, 0, true, true);
                this.completion.state = true;
            }
            // reset history index
            this.resetState(this.history);
            break;
        default:
            // reset history index
            this.resetState(this.history);
            // reset completion index
            this.resetState(this.completion);
            // this.currentHead = null;
            // this.inNormalCompletion = false;
            break;
        }
    },

    resetState: function (aType) {
        aType.index = 0;
        aType.state = false;
    },

    fetchItem: function (aType, aDirection, aMoveCaret, aRing) {
        if (!aType || !aType.list.length)
            return;

        var index = aType.index + aDirection;
        if (index < 0)
            index = aType.list.length - 1;
        if (index >= aType.list.length)
            index = 0;

        var start = this.textbox.selectionStart;

        if (start == 0 || this.inNormalCompletion) {
            // normal completion
            this.inNormalCompletion = true;
        } else {
            // header / substring match
            var header;
            if (this.currentHead != null) {
                header = this.currentHead;
            } else {
                header = this.textbox.value.slice(0, start);
                this.currentHead = header;
            }

            var listLen = aType.list.length;
            var delta = (aDirection >= 0) ? 1 : -1;
            var i = index;
            var substrIndex;

            // while ((aDirection >= 0) ? (i < listLen) : (i >= 0)) {
            //     if (aType.list[i].slice(0, start) == header) {
            //         index = i;
            //         break;
            //     }

            //     i += delta;
            // }

            // if (this.compListIndex.length == 0) {
            //     // stay current position
            //     // index = aType.index;
            //     this.modules.display.echoStatusBar("No further match for [" + this.currentHead + "]");
            //     return;
            // }

            // index = compIndexList[i];

            while ((aDirection >= 0) ? (i < listLen) : (i >= 0)) {
                if (aType.list[i].slice(0, header.length) == header) {
                    index = i;
                    break;                    
                }
                if (this.substrMatch &&
                    (substrIndex = aType.list[i].indexOf(header)) != -1) {
                    index = i;
                    // quick hack (changing start value is not good)
                    start = substrIndex + header.length;
                    break;
                }
                i += delta;
            }

            if ((aDirection >= 0 && i == listLen) ||
                (aDirection < 0  && i == -1)) {

                if (aRing) {
                    aType.index =
                        (aDirection == 0) ? 0 :
                        (aDirection > 0)  ? -1 : listLen;

                    this.fetchItem(aType, aDirection, aMoveCaret, false);
                    return;
                }

                // stay current position
                // index = aType.index;
                this.modules.display.echoStatusBar("No further match for [" + this.currentHead + "]");
                return;
            }
        }

        if (this.currentHead) {
            this.modules.display.echoStatusBar(aType.name + " Match for [" + this.currentHead + "]");
        } else {
            this.modules.display.echoStatusBar(aType.name + " (" + (index + 1) +  " / " + aType.list.length + ")");
        }

        this.textbox.value = aType.list[index];
        aType.index = index;

        this.textbox.selectionStart = this.textbox.selectionEnd =
            aMoveCaret ? this.textbox.value.length : start;
    },

    /**
     * Read string from prompt and execute <aCallback>
     * @param {string} aMsg message to be displayed
     * @param {function} aCallback function to execute after read
     * @param {object} aUserArg any object which will be passed to the <aCallback>
     * <aCallback> must take two arguments like below.
     * function callback(aReadStr, aUserArg);
     * The first aReadStr becomes the string read from prompt
     * The second arguments
     * @param {[string]} aCollection string list used to completion
     * @param {string} aInitialInput
     * @param {string} aInitialCount
     * @param {string} aGroup history group
     */
    read: function (aMsg, aCallback, aUserArg, aCollection, aInitialInput, aInitialCount, aGroup) {
        if (!this.promptbox)
            return;

        if (this.currentCallback) {
            this.modules.display.echoStatusBar("Prompt is already used by another command");
            return;
        }

        this.savedFocusedElement = window.document.commandDispatcher.focusedElement || window.content.window;

        // set up history
        this.history.index = 0;
        aGroup = aGroup || "default";
        if (aGroup && typeof(this.historyHolder[aGroup]) == "undefined")
            this.historyHolder[aGroup] = [];
        this.history.list = this.historyHolder[aGroup];

        // set up completion
        this.completion.list = aCollection;
        this.completion.index = aInitialCount || 0;

        // set up callbacks
        this.currentCallback = aCallback;
        this.currentUserArg = aUserArg;

        // display prompt box
        this.label.value = aMsg;
        this.textbox.value = aInitialInput || "";
        this.promptbox.hidden = false;
        // do not set selection value till textbox appear (cause crash)
        this.textbox.selectionStart = this.textbox.selectionEnd = 0;

        // now focus to the input area
        this.textbox.focus();
        // add event listener
        this.textbox.addEventListener('blur', this, false);
        this.textbox.addEventListener('keypress', this, false);
        this.textbox.addEventListener('keydown', this, false);
    },

    /**
     * Finish inputting and current the prompt and If user can
     * @param {boolean} aCancelled true, if user cancelled the prompt
     */
    finish: function (aCancelled) {
        this.textbox.removeEventListener('blur', this, false);
        this.textbox.removeEventListener('keypress', this, false);
        this.textbox.removeEventListener('keydown', this, false);

        // We need to call focus() here
        // because the callback sometimes change the current selected tab
        // e.g. opening the URL in a new tab, 
        // and the window.focus() does not work that time.
        if (this.savedFocusedElement) {
            this.savedFocusedElement.focus();
            this.savedFocusedElement = null;
        }

        if (this.currentCallback) {
            var readStr = aCancelled ? null : this.textbox.value;

            this.currentCallback(readStr, this.currentUserArg);

            if (!aCancelled && readStr.length)
                this.history.list.unshift(readStr);

            this.currentCallback = null;
        }

        this.currentUserArg = null;

        this.currentHead = null;
        this.inNormalCompletion = false;

        this.promptbox.hidden = true;

        this.textbox.value = "";
        this.label.value = "";
    },

    message: KeySnail.message
};
