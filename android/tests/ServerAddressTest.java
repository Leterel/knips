package de.leterel.knips;
public final class ServerAddressTest {
    private static int count;
    private static void check(boolean ok) { count++; if(!ok)throw new AssertionError("Address case " + count); }
    public static void main(String[] args) {
        check(ServerAddress.normalize(" HTTPS://Fotos.Example.org ").equals("https://fotos.example.org/"));
        for(String good:new String[]{"http://10.0.2.2:8790/","http://127.0.0.1:8790","http://localhost:8790","https://fotos.example.org:443"}) check(ServerAddress.normalize(good).endsWith("/"));
        for(String bad:new String[]{"http://example.org","http://192.168.1.2:8790","https://user:secret@example.org","https://example.org/path","https://example.org/?secret=x","https://example.org/#x","javascript:alert(1)","file:///sdcard/x","https://example.org:0","https://example.org:99999","https://","", "http://localhost.evil.org"}) {
            boolean rejected=false; try{ServerAddress.normalize(bad);}catch(IllegalArgumentException expected){rejected=true;}check(rejected);
        }
        check(ServerAddress.contains("https://fotos.example.org/","https://FOTOS.example.org:443/api/feed?p=2"));
        for(String other:new String[]{"http://fotos.example.org/","https://fotos.example.org.evil.org/","https://fotos.example.org:444/","https://x@fotos.example.org/","data:text/html,x"}) check(!ServerAddress.contains("https://fotos.example.org/",other));
        System.out.println("PASS: " + count + " server address and navigation boundary checks");
    }
}
