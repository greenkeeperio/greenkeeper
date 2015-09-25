# Getting Started with Greenkeeper

You first step after installing `greenkeeper` is to log in. Type:

    $ greenkeeper login

Your browser will open a new window or tab and redirect you to
GitHub’s Application Authentication screen. There is a big green
button [Authorize application] at the bottom. When you click it,
Greenkeeper gets the access to GitHub it needs to do its job, but
no more. When all goes well, your browser will say “Check your
Terminal”, and when you switch back here, the login will be done
and Greenkeeper will have started to sync your GitHub repo
information.

Congratulations, you made it past the most complicated step!

Next, you enable a package of yours. To do this, navigate to a
local copy of your package (e.g. `cd ~/code/mypackage`). Then:

    $ greenkeeper enable

And that’s it already! :)

From here on out, Greenkeeper will work its magic. The first thing
you are going to notice is a Pull Request where we pin all your
dependencies in your package’s package.json to their respective
latest versions. Then, whenever one of your dependencies is updated
on GitHub, you will receive a Pull Request to update your package
accordingly.

If you’d like to talk to a human or want to report an issue, type:

    $ greenkeeper support

🌴
