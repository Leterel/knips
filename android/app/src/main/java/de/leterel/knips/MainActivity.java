package de.leterel.knips;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int PICK_IMAGE = 41;
    private WebView browser;
    private TextView status;
    private String server;
    private boolean loadFailed;
    private ValueCallback<Uri[]> chooser;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(255,249,243));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setPadding(dp(12), dp(3), dp(12), dp(3));
        toolbar.setGravity(android.view.Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this); title.setText("Knips"); title.setTextSize(22); title.setTextColor(Color.rgb(132,46,76));
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button refresh = new Button(this); refresh.setText("Neu laden"); refresh.setTextSize(12);
        refresh.setOnClickListener(v -> { if (server != null) browser.loadUrl(server); }); toolbar.addView(refresh);
        Button address = new Button(this); address.setText("Server"); address.setTextSize(12);
        address.setOnClickListener(v -> configure()); toolbar.addView(address);
        root.addView(toolbar);
        status = new TextView(this); status.setPadding(dp(16),dp(5),dp(16),dp(5)); status.setTextSize(12);
        status.setText("Verbinde deinen Knips-Server."); root.addView(status);
        browser = new WebView(this);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                loadFailed = false; status.setText("Verbinde …");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                boolean allowed = server != null && ServerAddress.contains(server, request.getUrl().toString());
                if (!allowed) Toast.makeText(MainActivity.this,"Dieser Link gehört nicht zu deinem Knips-Server.",Toast.LENGTH_SHORT).show();
                return !allowed;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!loadFailed && server != null && ServerAddress.contains(server,url)) {
                    status.setText(server); CookieManager.getInstance().flush();
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { loadFailed=true; status.setText("Server nicht erreichbar. Adresse und Serverstart prüfen, dann neu laden."); }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams params) {
                cancelChooser(); chooser = result;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg","image/png","image/webp"});
                pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(pick, PICK_IMAGE); }
                catch (ActivityNotFoundException error) { cancelChooser(); Toast.makeText(MainActivity.this,"Keine Dateiauswahl verfügbar.",Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        root.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root); root.requestApplyInsets();
        server = getPreferences(MODE_PRIVATE).getString("server",null);
        if (server != null) { try { server = ServerAddress.normalize(server); browser.loadUrl(server); } catch (IllegalArgumentException error) { server=null; } }
        if (server == null) configure();
    }

    private void configure() {
        EditText input = new EditText(this);
        input.setSingleLine(true); input.setText(server == null ? "" : server);
        input.setHint("https://fotos.deine-domain.de");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20),dp(6),dp(20),dp(6));
        TextView info = new TextView(this);
        info.setText("Adresse eures selbst gehosteten Knips-Servers. Zum lokalen Emulator-Test: http://10.0.2.2:8790");
        content.addView(info); content.addView(input);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Dein Foto-Zuhause").setView(content)
            .setPositiveButton("Verbinden",null).setNegativeButton("Abbrechen",null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            final String next;
            try { next=ServerAddress.normalize(input.getText().toString()); } catch(IllegalArgumentException error) { input.setError(error.getMessage()); return; }
            boolean changed = !next.equals(server); cancelChooser(); browser.stopLoading(); server=next;
            getPreferences(MODE_PRIVATE).edit().putString("server",server).apply();
            browser.clearHistory(); status.setText("Verbinde …");
            if (changed) CookieManager.getInstance().removeAllCookies(done -> { if(!isDestroyed() && next.equals(server)) browser.loadUrl(next); }); else browser.loadUrl(next);
            dialog.dismiss();
        }));
        dialog.show();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if(request == PICK_IMAGE && chooser != null) {
            ValueCallback<Uri[]> pending=chooser; chooser=null;
            Uri uri=result==RESULT_OK && data!=null ? data.getData() : null;
            pending.onReceiveValue(uri!=null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
        }
    }
    @Override public void onBackPressed() { if(browser.canGoBack()) browser.goBack(); else super.onBackPressed(); }
    private void cancelChooser() { if(chooser!=null) { chooser.onReceiveValue(null); chooser=null; } }
    @Override protected void onDestroy() { cancelChooser(); if(browser!=null) { browser.stopLoading(); browser.destroy(); } super.onDestroy(); }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
}
