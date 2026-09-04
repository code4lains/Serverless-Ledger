package com.ledger.serverless.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor 桥接插件:接收前端 WidgetPayload 并触发桌面小组件刷新。
 * 前端调用: LedgerWidget.updateWidgetData({ data: payload })
 */
@CapacitorPlugin(name = "LedgerWidget")
public class LedgerWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        try {
            JSObject data = call.getObject("data");
            if (data == null) {
                call.reject("Missing data payload");
                return;
            }

            // JSObject -> String: 使用 toString() 得到 JSON 字符串持久化
            String jsonStr = data.toString();

            Context context = getContext();
            if (context == null && getActivity() != null) {
                context = getActivity().getApplicationContext();
            }
            if (context == null) {
                call.reject("Context is null");
                return;
            }

            SharedPreferences prefs = context.getSharedPreferences(
                LedgerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
            );
            // 使用 commit() 保证同步落盘后再触发刷新
            prefs.edit().putString(LedgerWidgetProvider.KEY_DATA, jsonStr).commit();

            // 1. 就地直接更新 RemoteViews (无需排队等待广播调度，实现 0 延迟响应)
            try {
                LedgerWidgetProvider.updateAllWidgets(context);
            } catch (Exception ignored) {
            }

            // 2. 主动触发系统桌面小组件广播更新
            int[] ids;
            try {
                AppWidgetManager mgr = AppWidgetManager.getInstance(context);
                int[] foundIds = mgr.getAppWidgetIds(new ComponentName(context, LedgerWidgetProvider.class));
                ids = (foundIds != null) ? foundIds : new int[0];
            } catch (Exception ignored) {
                ids = new int[0];
            }

            try {
                Intent intent = new Intent(context, LedgerWidgetProvider.class);
                intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
                context.sendBroadcast(intent);
            } catch (Exception ignored) {
            }

            call.resolve();
        } catch (Exception e) {
            try {
                call.reject("updateWidgetData failed: " + e.getMessage());
            } catch (Exception ignored) {
            }
        }
    }
}
