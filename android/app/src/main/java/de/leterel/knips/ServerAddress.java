package de.leterel.knips;

import java.net.URI;
import java.util.Locale;

/** Same-origin navigation and HTTPS with an explicit emulator/loopback exception. */
public final class ServerAddress {
    public static String normalize(String input) {
        try {
            URI uri = new URI(input.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            boolean local = host.equals("localhost") || host.equals("127.0.0.1") || host.equals("10.0.2.2");
            if (!(scheme.equals("https") || (scheme.equals("http") && local)) || host.isEmpty()
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
                || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            return new URI(scheme, null, host, uri.getPort(), "/", null, null).toASCIIString();
        } catch (Exception error) {
            throw new IllegalArgumentException("HTTPS-Server ohne Pfad eingeben. HTTP ist nur lokal oder im Emulator erlaubt.");
        }
    }

    public static boolean contains(String base, String candidate) {
        try {
            URI a = new URI(normalize(base)), b = new URI(candidate);
            if (b.getRawUserInfo() != null || b.getHost() == null) return false;
            return a.getScheme().equalsIgnoreCase(b.getScheme()) && a.getHost().equalsIgnoreCase(b.getHost())
                && port(a) == port(b);
        } catch (Exception error) { return false; }
    }

    private static int port(URI uri) { return uri.getPort() == -1 ? ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80) : uri.getPort(); }
    private ServerAddress() {}
}
