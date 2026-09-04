package com.ledger.serverless.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import com.ledger.serverless.MainActivity;
import com.ledger.serverless.R;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 账盾桌面小组件 Provider。
 *
 * Payload 约定 (SharedPreferences `ledger_widget_prefs` / key `widget_data`, JSON):
 *   ledgerName, item1_label/val, item2_label/val, item3_label/val,
 *   clickAction (record|detail|stats), updatedAt (ISO), updatedAtDay (YYYY-MM-DD), hideAmounts (可选 boolean)
 */
public class LedgerWidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "ledger_widget_prefs";
    public static final String KEY_DATA = "widget_data";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            super.onReceive(context, intent);
            if (intent != null && AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
                AppWidgetManager mgr = AppWidgetManager.getInstance(context);
                int[] ids = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS);
                if (ids == null || ids.length == 0) {
                    try {
                        ids = mgr.getAppWidgetIds(new ComponentName(context, LedgerWidgetProvider.class));
                    } catch (Exception ignored) {
                        ids = new int[0];
                    }
                }
                if (ids != null && ids.length > 0) {
                    updateWidgets(context, mgr, ids);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        try {
            updateWidgets(context, appWidgetManager, appWidgetIds);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void updateWidgets(Context context, AppWidgetManager mgr, int[] ids) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String dataStr = prefs.getString(KEY_DATA, null);

            String ledgerName = "请打开App同步数据";
            String label1 = "今日支出";
            String value1 = "-.--";
            String label2 = "本月支出";
            String value2 = "-.--";
            String label3 = "本月结余";
            String value3 = "-.--";
            String clickAction = "record";
            String updatedAtDay = null;
            boolean hideAmounts = false;

            if (dataStr != null) {
                try {
                    JSONObject json = new JSONObject(dataStr);
                    ledgerName = json.optString("ledgerName", ledgerName);
                    label1 = json.optString("item1_label", label1);
                    value1 = json.optString("item1_val", value1);
                    label2 = json.optString("item2_label", label2);
                    value2 = json.optString("item2_val", value2);
                    label3 = json.optString("item3_label", label3);
                    value3 = json.optString("item3_val", value3);
                    clickAction = json.optString("clickAction", clickAction);
                    hideAmounts = json.optBoolean("hideAmounts", false);

                    String updatedAtDayJson = json.optString("updatedAtDay", "");
                    if (!updatedAtDayJson.isEmpty()) {
                        updatedAtDay = updatedAtDayJson;
                    } else {
                        String updatedAt = json.optString("updatedAt", "");
                        updatedAtDay = (updatedAt.length() >= 10) ? updatedAt.substring(0, 10) : null;
                    }
                } catch (Exception ignored) {
                    // JSON 解析失败则使用默认值继续渲染，保证不崩
                }
            }

            // 跨天清零: today 项 (label 含"今日") 若数据统计的本地日期 != 今天本地日期，显示 0.00
            try {
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
                if (updatedAtDay != null && !updatedAtDay.equals(today)) {
                    if (label1.contains("今日")) value1 = "0.00";
                    if (label2.contains("今日")) value2 = "0.00";
                    if (label3.contains("今日")) value3 = "0.00";
                }
            } catch (Exception ignored) {
            }

            // 锁定隐藏金额: 显示 ****
            if (hideAmounts) {
                value1 = "****";
                value2 = "****";
                value3 = "****";
            }

            for (int appWidgetId : ids) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_ledger_card);
                views.setTextViewText(R.id.tv_ledger_name, ledgerName);
                views.setTextViewText(R.id.tv_label1, label1);
                views.setTextViewText(R.id.tv_value1, value1);
                views.setTextViewText(R.id.tv_label2, label2);
                views.setTextViewText(R.id.tv_value2, value2);
                views.setTextViewText(R.id.tv_label3, label3);
                views.setTextViewText(R.id.tv_value3, value3);

                // 卡片主体点击 Intent (依据用户配置 clickAction: 记账/明细/统计)
                Intent deepLink = new Intent(context, MainActivity.class);
                deepLink.setAction(Intent.ACTION_VIEW);
                deepLink.setData(Uri.parse("ledger://widget?action=" + clickAction));
                deepLink.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                PendingIntent pending = PendingIntent.getActivity(
                    context, 0, deepLink,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                views.setOnClickPendingIntent(R.id.widget_container, pending);

                // 快捷“+ 记一笔”按钮直接拉起记账弹窗
                try {
                    Intent recordLink = new Intent(context, MainActivity.class);
                    recordLink.setAction(Intent.ACTION_VIEW);
                    recordLink.setData(Uri.parse("ledger://widget?action=record"));
                    recordLink.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                    PendingIntent recordPending = PendingIntent.getActivity(
                        context, 1, recordLink,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    views.setOnClickPendingIntent(R.id.btn_quick_record, recordPending);
                } catch (Exception ignored) {
                }

                try {
                    mgr.updateAppWidget(appWidgetId, views);
                } catch (Exception ignored) {
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, LedgerWidgetProvider.class));
            if (ids != null && ids.length > 0) {
                LedgerWidgetProvider provider = new LedgerWidgetProvider();
                provider.updateWidgets(context, mgr, ids);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
