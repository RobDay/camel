@@ Title=Xcode6-Beta5 and xcodebuild
@@ Date=2014-08-15 20:30

With the latest release of Xcode 6 (beta 5), I came across a bunch of problems in building one of the applications that I work on daily.  There are a series scripts that bundle the application in a few different flavors.  These scripts touch some build settings, swap some entitlements files, and do other small tweaks to modify some small pieces of how the app gets built.  Once iOS 8 beta 5 was released, the application would still build successfully except running the app would lead to an immediate crash.  Digging into the device logs yielded:

> Aug 12 08:41:15 Roberts-iPad kernel[0] <Notice>: AMFI:(pid 268) - [deny-mmap] mapped file has no team identifier and is not a platform binary: /private/var/mobile/Containers/Bundle/.../Frameworks/libswiftCore.dylib


This seemed like a really odd error message to get whenever the build crashed.  Getting builds to work successfully wasn't easy to accomplish.  After these crashes began, I figured something had gone wrong with signing the build.  I began to dig through all of the build logs to see if there were any warnings thrown that weren't being handled properly.  I soon found this:


> Program /usr/bin/codesign returned 3 : [/Users/<theuser>/Library/Developer/Xcode/Archives/2014-08-12/TheApp 8-12-14, 11.02 AM.xcarchive/Products/Applications/TheApp.app: valid on disk/Users/<theuser>/Library/Developer/Xcode/Archives/2014-08-12/TheApp 8-12-14, 11.02 AM.xcarchive/Products/Applications/TheApp.app: does not satisfy its designated Requirement


I had never seen an error like this in the past.  It seemed that however the build was being signed was now failing.  No changes were made to the build process between the release of beta 4 and beta 5 of Xcode.  After much investigating, I found that the codesigning identity was marked as 'Always Trust' on the build machine.  For whatever reason, setting this trust back to the system default allowed the build to run once again.  I don't really understand why this change fixed the builds but hopefully this can help solve someone else's problem!
