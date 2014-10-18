@@ Title=iOS 8 Widget Not Updating!
@@ Date=2014-10-17 20:30


With the release of iOS 8 came extensions.  Extensions allow your users to access some pieces of your application throughout the operating systems as well as from within other applications.  Today Extensions allow your application to make a widget that is available by pulling down on the notification center and navigating to the 'Today' tab.  These widgets allow apps to provide a small snapshot of content and functionality to their users.  Apple has built in widgets for things like calendar and stocks.

I chose to build a widget out in swift as a first attempt to integrate swift into a project.  The widget builds into its own target so it was a nice separation of swift code for the first few swift classes.  The development process was quite shaky.  I wasn't able to use Xcode breakpoints and had to rely on `println` to send debug statements to the console (it was a tad hard).  In development, the widget worked pretty well and updated reliably.  

Once the widget hit production, users' reports frequently complained that the widget didn't update.  Widgets receive `optional func widgetPerformUpdateWithCompletionHandler(_ completionHandler: ((NCUpdateResult) -> Void)!)` .  In development, the system reliably sent this to the widget to give it a chance to update content.  In production, however, it seemed that the widget would get into a state where the OS stopped sending this message.  

The fix for this, while quite hacky, was to simply update the widget's content every time the widget's view controller received `viewWillAppear`.  This isn't desirable but I found no better way to guarantee that the widget would update.  I hope this helps anyone who has a non-updating widget!
