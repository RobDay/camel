@@ Title=UIPageViewController memory leak with setViewController
@@ Date=2014-08-10 16:40

I was recently working with a UIPageViewController attempting to make a strategy that would allow the pageViewController to reload its neighbors.  While implementing the solution, I found that if you call `setViewControllers` on a pageViewController with the current onscreen view controller problems would arise.  It seems that the pageViewController will leak the original view controller that was set in the initial `setViewControllers` call.

For example:

    let pvc = UIPageViewController(transitionStyle: .Scroll,
                navigationOrientation:.Horizontal,
                options:nil)
    let someVC = UIViewController()

    pvc.setViewControllers([someVC],
        direction: UIPageViewControllerNavigationDirection.Forward,
        animated: false) { _ in

    }
...some time later...

    pvc.setViewControllers([someVC],
        direction: UIPageViewControllerNavigationDirection.Forward,
        animated: false) { _ in

    }
    //At this point, the original 'someVC' is still in memory
    //and doesn't get cleaned up


The only workaround I found that prevented the leaking of a view controller was to first set the current view controller to a placeholder view controller and then immediately set it back:

    let pvc = UIPageViewController(transitionStyle: .Scroll,
        navigationOrientation:.Horizontal,
        options:nil)
    let someVC = UIViewController()

    pvc.setViewControllers([someVC],
        direction: UIPageViewControllerNavigationDirection.Forward,
        animated: false) { _ in

    }
..some time later

    let placeholderVC = UIViewController()
    pvc.setViewControllers([placeholderVC],
        direction: UIPageViewControllerNavigationDirection.Forward,
        animated: false) { _ in
        pvc.setViewControllers([someVC],
            direction: UIPageViewControllerNavigationDirection.Forward,
            animated: false) { _ in

        }
    }
