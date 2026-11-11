I wrote `hash-map-collision.json` and built `hash-map-collision.html`. Open the HTML file in a browser; Space plays, arrow keys step.

It shows three keys going into a hash map with four buckets in 18 steps. "cat" and "act" collide in bucket 0 and are chained; a lookup for "act" walks the chain and succeeds; a lookup for "tac", which was never stored, walks the chain and fails.

Simplifications:
- The hash function is a toy (sum of character codes) so the arithmetic fits on screen.
- The table never resizes, and chains are plain linked lists.
- Open addressing, the other common strategy, is only mentioned.

Sources:
- Java SE 21 API, java.util.HashMap: https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html
- OpenJDK HashMap.java implementation notes: https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java

This is a teaching model. Check it against the sources before relying on it.
