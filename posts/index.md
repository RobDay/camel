@@ Title=Home
@@ BodyClass=homepage
@@ DayTemplate=<div class="day"><section>{{#each articles}}{{> article}}{{/each}}</div><hr class="daybreak" /></section>
@@ ArticlePartial=<article>{{{metadata.header}}}{{{unwrappedBody}}}</article>
@@ FooterTemplate=<div class="paginationFooter">{{#if prevPage}}<a href="/?p={{prevPage}}" class="previousPage">&laquo; Newer</a>{{/if}}{{#if nextPage}}<a href="/?p={{nextPage}}" class="nextPage">&raquo; Older</a>{{/if}}</div>
