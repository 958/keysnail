/**
 * @fileOverview
 * @name yet-another-twitter-client-keysnail.js
 * @description Make KeySnail behave like Twitter client
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

// PLUGIN INFO: {{{
var PLUGIN_INFO =
    <KeySnailPlugin>
    <name>Yet Another Twitter Client KeySnail</name>
    <description>Make KeySnail behave like Twitter client</description>
    <description lang="ja">KeySnail を Twitter クライアントに</description>
    <version>1.0</version>
    <updateURL>http://github.com/mooz/keysnail/raw/master/scripts/yet-another-twitter-client-keysnail.js</updateURL>
    <author mail="stillpedant@gmail.com" homepage="http://d.hatena.ne.jp/mooz/">mooz</author>
    <license>The MIT License</license>
    <license lang="ja">MIT ライセンス</license>
    <minVersion>0.9.2</minVersion>
    <maxVersion>0.9.*</maxVersion>
    <detail><![CDATA[
      == Set up ==
      In your .keysnail.js file,
      >||
      userscript.require("yet-another-twitter-client-keysnail.js");
      ||<
      == Usage ==
      Press 't' key (or your defined one) to start this client.

      Once this function has been called, the timer will be set, and the timeline
      of Twitter periodically updated. This interval can be configured by changing
      the "updateInterval" option.

      If you set the "popUpStatusWhenUpdated" option to true, pretty notification
      dialog will be pop upped when new tweets are arrived.
    ]]></detail>
    <detail lang="ja"><![CDATA[
      == セットアップ ==
      .keysnail.js へ次の一行を付け加えてください
      >||
      userscript.require("yet-another-twitter-client-keysnail.js");
      ||<
      == 使い方 ==
      't' キー (や独自に設定したキー) を入力することで Twitter クライアントが起動します。

       クライアント起動時にタイマーがセットされ、 Twitter のタイムラインが定期的に更新されるようになります。
       "updateInterval" の値を変更することにより、この間隔を変えることが可能です。
       "popUpStatusWhenUpdated" オプションが true に設定されていれば、新しいつぶやきが届いた際に
       ポップアップで通知が行われるようになります。
    ]]></detail>
    </KeySnailPlugin>;
// }}}

key.setViewKey('t', function (aEvent, aArg) {
    var updateInterval         = 60 * 1000;    // Update interval in mili second
    var popUpStatusWhenUpdated = true;         // Show popup when timeline is updated
    var mainColumnWidth        = [11, 68, 21]; // [User name, Message, Information] in percentage

    var blockUser = my.blockUser || undefined;

    var twitterActions = [
        [function (status) {
             if (status)
                 tweet();
         }, "Tweet (つぶやく)"],
        [function (status) {
             if (status) {
                 tweet("@" + status.screen_name+ " ", status.id);
             }
         }, "Reply (返信)"],
        [function (status) {
             if (status) {
                 tweet("RT @" + status.screen_name+ ": " + status.text);
             }
         }, "Retweet"],
        [function (status) {
             if (status) {
                 showFollowersStatus(username, password, status.screen_name);
             }
         }, "Show Target status (そのユーザのステータスを見る)"],
        [function (status) {
             if (status) {
                 showMentions();
             }
         }, "Show mentions (自分への返信一覧)"],
        [function (status) {
             popUpStatusWhenUpdated = !popUpStatusWhenUpdated;
             display.echoStatusBar("Pop up " + (popUpStatusWhenUpdated ? "enabled" : "disabled"));
         }, "Toggle pop up status (ポップアップ通知の切り替え)"],
        [function (status) {
             if (status) {
                 tweet(content.document.title + " - " + getTinyURL(window.content.location.href));
             }
         }, "Tweet with the current web page URL (現在のページのタイトルと URL を使ってつぶやく)"],
        [function (status) {
             if (status) {
                 gBrowser.loadOneTab("http://twitter.com/" + status.screen_name
                                     + "/status/" + status.id, null, null, null, false);
             }
         }, "Show status in web page (ステータスのウェブページを見る)"],
        [function (status) {
             if (status)
                 search();
         }, "Search keyword (検索)"],
        [function (status) {
             if (status) {
                 var matched = status.text.match("(https?|ftp)(://[a-zA-Z0-9/?#_.\\-]+)");
                 if (matched) {
                     gBrowser.loadOneTab(matched[1] + matched[2], null, null, null, false);
                 }
             }
         }, "Visit URL in the message (メッセージ内の URL へジャンプ)"]
    ];

    // ============================== Arrange services, username and password ============================== //

    try {
        var alertsService = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
    } catch (x) {
        popUpStatusWhenUpdated = false;
    }
    var passwordManager = Cc['@mozilla.org/login-manager;1'].getService(Ci.nsILoginManager);

    var logins = passwordManager.findLogins({}, "http://twitter.com", "https://twitter.com", null);
    var username = "", password = "";
    if (logins.length) {
        [username, password] = [logins[0].username, logins[0].password];
    }

    var evalFunc = window.eval;
    try {
        var sandbox = new(Components.utils.Sandbox)("about:blank");
        if (Components.utils.evalInSandbox("true", sandbox) === true) {
            evalFunc = function (text) {
                return Components.utils.evalInSandbox(text, sandbox);
            };
        }
    } catch(e) {}

    // ============================== Popup notifications {{ ============================== //

    var unPopUppedStatuses;
    var popUpNewStatusesObserver = {
        observe: function (subject, topic, data) {
            if (topic == "alertclickcallback") {
                gBrowser.loadOneTab(data, null, null, null, false);
            }

            if (!unPopUppedStatuses || !unPopUppedStatuses.length)
                return;

            showOldestUnPopUppedStatus();
        }
    };

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    function showOldestUnPopUppedStatus() {
        var status = unPopUppedStatuses.pop();

        if (blockUser && blockUser.some(function (username) username == status.user.screen_name)) {
            util.message("ignored :: " + status.text + " from " + status.user.screen_name);
            return;
        }

        var browserWindow = wm.getMostRecentWindow("navigator:browser");
        if (!browserWindow || browserWindow.KeySnail != KeySnail) {
            util.message("other window");
            return;
        }

        alertsService.showAlertNotification(status.user.profile_image_url,
                                            status.user.name,
                                            status.text,
                                            true,
                                            "http://twitter.com/" + status.user.screen_name + "/status/" + status.id,
                                            popUpNewStatusesObserver);
    }

    function popUpNewStatuses(statuses) {
        if (unPopUppedStatuses && unPopUppedStatuses.length > 0)
            unPopUppedStatuses = statuses.concat(unPopUppedStatuses);
        else
            unPopUppedStatuses = statuses;

        showOldestUnPopUppedStatus();
    }

    // ============================== }} Popup notifications ============================== //

    function getTinyURL(aURL) {
        var xhr = new XMLHttpRequest();
        var endPoint = "http://tinyurl.com/api-create.php?url=" + aURL;
        xhr.open("GET", endPoint, false);
        xhr.send(null);

        return xhr.responseText;
    }

    function getElapsedTimeString(aMillisec) {
        function format(num, str) {
            return Math.floor(num) + " " + str;
        }

        var sec = aMillisec / 1000;
        if (sec < 1.0)
            return "ついさっき";
        var min = sec / 60;
        if (min < 1.0)
            return format(sec, "秒前");
        var hour = min / 60;
        if (hour < 1.0)
            return format(min, "分前");
        var date = hour / 24;
        if (date < 1.0)
            return format(hour, "時間前");
        return format(date, "日前");
    }

    function combineJSONCache(aNew, aOld) {
        if (!aOld)
            return aNew;

        var oldid = aOld[0].id;
        for (var i = 0; i < aNew.length; ++i) {
            if (aNew[i].id == oldid) break;
        }

        if (i - 1 > 0) {
            var updatedStatus = aNew.slice(0, i);
            var latestTimeline = updatedStatus.concat(aOld);

            if (popUpStatusWhenUpdated)
                popUpNewStatuses(updatedStatus);

            return latestTimeline;
        }

        return aOld;
    }

    // ============================== Actions ============================== //

    function showMentions() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "https://twitter.com/statuses/mentions.json", false, username, password);
        xhr.send(null);
        var statuses = evalFunc(xhr.responseText);

        prompt.selector(
            {
                message: "regexp:",
                collection: statuses.map(
                    function (status) {
                        return [status.user.profile_image_url, status.user.screen_name, status.text];
                    }),
                style: ["color:#003870;", null],
                width: [15, 85],
                header: ["From", 'Message'],
                flags: [ICON | IGNORE, 0, 0],
                filter: function (aIndex) {
                    var status = statuses[aIndex];

                    return (aIndex < 0 ) ? [null] :
                        [{screen_name: status.user.screen_name, id: status.id, text: status.text}];
                },
                actions: twitterActions
            });
    }

    function search() {
        prompt.read("search:",
                    function (aWord) {
                        if (aWord == null)
                            return;

                        var xhr = new XMLHttpRequest();
                        xhr.open("GET", "http://search.twitter.com/search.json?q=" + encodeURIComponent(aWord), false);
                        xhr.send(null);
                        var results = (evalFunc("("+xhr.responseText+")") || {"results":[]}).results;

                        prompt.selector(
                            {
                                message: "regexp:",
                                collection: results.map(
                                    function (result) {
                                        return [result.profile_image_url, result.from_user, result.text];
                                    }),
                                style: ["color:#003870;", null],
                                width: [15, 85],
                                header: ["From", 'Search result for "' + aWord + '"'],
                                flags: [ICON | IGNORE, 0, 0],
                                filter: function (aIndex) {
                                    var result = results[aIndex];

                                    return (aIndex < 0 ) ? [null] :
                                        [{screen_name: result.from_user,
                                          id: result.id,
                                          text: result.text}];
                                },
                                actions: twitterActions
                            });
                    });
    }

    function tweet(aInitialInput, aReplyID) {
        prompt.read("tweet:",
                    function (aTweet) {
                        if (aTweet == null) {
                            return;
                        }

                        var xhr = new XMLHttpRequest;
                        xhr.onreadystatechange = function (aEvent) {
                            if (xhr.readyState == 4) {
                                if (xhr.status != 200) {
                                    alertsService.showAlertNotification(null, "I'm sorry...", "Failed to tweet", false, "", null);
                                    return;
                                }
                                var status = evalFunc("(" + xhr.responseText + ")");

                                // immediately add
                                my.twitterJSONCache.unshift(status);

                                var icon_url = status.user.profile_image_url;
                                var user_name = status.user.name;
                                var message = status.text;
                                alertsService.showAlertNotification(icon_url, user_name, message, false, "", null);
                            }
                        };

                        xhr.open("POST", "http://twitter.com/statuses/update.json", true, username, password);
                        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                        xhr.setRequestHeader("X-Twitter-Client", "KeySnail");
                        xhr.setRequestHeader("X-Twitter-Client-Version", "0.1");

                        var query = "status=" + aTweet;
                        if (aReplyID)
                            query += "&in_reply_to_status_id=" + aReplyID;
                        xhr.send(query);
                    }, null, null, aInitialInput);
    }

    function showFollowersStatus(username, password, target) {
        function callSelector(priorStatus) {
            var statuses = priorStatus || my.twitterJSONCache;

            var current = new Date();

            var collection = statuses.map(
                function (status) {
                    var created = Date.parse(status.created_at);
                    var matched = status.source.match(">(.*)</a>");

                    return [status.user.profile_image_url, status.user.name, status.text,
                            getElapsedTimeString(current - created) +
                            " from " + (matched ? matched[1] : "Web") +
                            (status.in_reply_to_screen_name ?
                             " to " + status.in_reply_to_screen_name : "")];
                }
            );

            prompt.selector(
                {
                    message: "pattern:",
                    collection: collection,
                    flags: [ICON | IGNORE, 0, 0, 0],
                    style: ["color:#0e0067;", null, "color:#660025;"],
                    width: mainColumnWidth,
                    header: ["User", "Timeline : Press Enter to tweet. Ctrl + i (or your defined one) to select the action!", "Info"],
                    filter: function (aIndex) {
                        var status = statuses[aIndex];

                        return (aIndex < 0 ) ? [null] :
                            [{screen_name: status.user.screen_name,
                              id: status.id,
                              text: status.text}];
                    },
                    actions: twitterActions
                });
        }

        function updateJSONCache(aAfterWork, aNoRepeat) {
            my.twitterPending = true;

            var xhr = new XMLHttpRequest();

            xhr.onreadystatechange = function (aEvent) {
                if (xhr.readyState == 4) {
                    my.twitterPending = false;

                    if (xhr.status != 200) {
                        display.echoStatusBar("Failed to get statuses");
                        return;
                    }

                    var statuses = evalFunc(xhr.responseText) || [];

                    if (!target) {
                        my.twitterLastUpdated = new Date();
                        my.twitterJSONCache = combineJSONCache(statuses, my.twitterJSONCache);
                    }

                    if (!aNoRepeat)
                        my.twitterJSONCacheUpdater = setTimeout(updateJSONCache, updateInterval);

                    if (typeof(aAfterWork) == "function")
                        aAfterWork();
                }
            };

            var endPoint = target ? "https://twitter.com/statuses/user_timeline/" + target + ".json"
                : "https://twitter.com/statuses/friends_timeline.json";
            xhr.open("GET", endPoint, true, username, password);
            xhr.send(null);
        }

        if (target) {
            var xhr = new XMLHttpRequest();

            xhr.onreadystatechange = function (aEvent) {
                if (xhr.readyState == 4) {
                    if (xhr.status != 200) {
                        display.echoStatusBar("Failed to get statuses");
                        return;
                    }

                    var statuses = evalFunc(xhr.responseText) || [];
                    callSelector(statuses);
                }
            };

            var endPoint = "https://twitter.com/statuses/user_timeline/" + target + ".json";
            xhr.open("GET", endPoint, true, username, password);
            xhr.send(null);

            return;
        }

        if (my.twitterPending) {
            display.echoStatusBar("Requesting to the Twitter ... Please wait.");
            return;
        }

        if (aArg != null || !my.twitterJSONCache) {
            // rebuild cache
            updateJSONCache(callSelector, aArg != null);
        } else {
            // use cache
            callSelector();
        }
    }

    showFollowersStatus(username, password);
}, 'Yet Another Twitter Client KeySnail', true);
