package com.ledger.serverless.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.ledger.serverless.MainActivity
import com.ledger.serverless.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 账盾桌面小组件 Provider。
 *
 * Payload 约定 (SharedPreferences `ledger_widget_prefs` / key `widget_data`, JSON):
 *   ledgerName, item1_label/val, item2_label/val, item3_label/val,
 *   clickAction (record|detail|stats), updatedAt (ISO), updatedAtDay (YYYY-MM-DD), hideAmounts (可选 boolean)
 */
class LedgerWidgetProvider : AppWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent?) {
        try {
            super.onReceive(context, intent)
            if (intent?.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
                val mgr = AppWidgetManager.getInstance(context)
                var ids = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS)
                if (ids == null || ids.isEmpty()) {
                    ids = try {
                        mgr.getAppWidgetIds(ComponentName(context, LedgerWidgetProvider::class.java))
                    } catch (_: Exception) {
                        intArrayOf()
                    }
                }
                if (ids != null && ids.isNotEmpty()) {
                    updateWidgets(context, mgr, ids)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        try {
            updateWidgets(context, appWidgetManager, appWidgetIds)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun updateWidgets(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val dataStr = prefs.getString(KEY_DATA, null)

            var ledgerName = "请打开App同步数据"
            var label1 = "今日支出"; var value1 = "-.--"
            var label2 = "本月支出"; var value2 = "-.--"
            var label3 = "本月结余"; var value3 = "-.--"
            var clickAction = "record"
            var updatedAtDay: String? = null
            var hideAmounts = false

            if (dataStr != null) {
                try {
                    val json = JSONObject(dataStr)
                    ledgerName = json.optString("ledgerName", ledgerName)
                    label1 = json.optString("item1_label", label1)
                    value1 = json.optString("item1_val", value1)
                    label2 = json.optString("item2_label", label2)
                    value2 = json.optString("item2_val", value2)
                    label3 = json.optString("item3_label", label3)
                    value3 = json.optString("item3_val", value3)
                    clickAction = json.optString("clickAction", clickAction)
                    hideAmounts = json.optBoolean("hideAmounts", false)

                    val updatedAtDayJson = json.optString("updatedAtDay", "")
                    if (updatedAtDayJson.isNotEmpty()) {
                        updatedAtDay = updatedAtDayJson
                    } else {
                        val updatedAt = json.optString("updatedAt", "")
                        updatedAtDay = if (updatedAt.length >= 10) updatedAt.substring(0, 10) else null
                    }
                } catch (_: Exception) {
                    // JSON 解析失败则使用默认值继续渲染，保证不崩
                }
            }

            // 跨天清零: today 项 (label 含"今日") 若数据统计的本地日期 != 今天本地日期，显示 0.00
            try {
                val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                if (updatedAtDay != null && updatedAtDay != today) {
                    if (label1.contains("今日")) value1 = "0.00"
                    if (label2.contains("今日")) value2 = "0.00"
                    if (label3.contains("今日")) value3 = "0.00"
                }
            } catch (_: Exception) {
            }

            // 锁定隐藏金额: 显示 ****
            if (hideAmounts) {
                value1 = "****"
                value2 = "****"
                value3 = "****"
            }

            for (appWidgetId in ids) {
                val views = RemoteViews(context.packageName, R.layout.widget_ledger_card)
                views.setTextViewText(R.id.tv_ledger_name, ledgerName)
                views.setTextViewText(R.id.tv_label1, label1)
                views.setTextViewText(R.id.tv_value1, value1)
                views.setTextViewText(R.id.tv_label2, label2)
                views.setTextViewText(R.id.tv_value2, value2)
                views.setTextViewText(R.id.tv_label3, label3)
                views.setTextViewText(R.id.tv_value3, value3)

                // 卡片主体点击 Intent (依据用户配置 clickAction: 记账/明细/统计)
                val deepLink = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    data = Uri.parse("ledger://widget?action=$clickAction")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val pending = PendingIntent.getActivity(
                    context, 0, deepLink,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_container, pending)

                // 快捷“+ 记一笔”按钮直接拉起记账弹窗
                try {
                    val recordLink = Intent(context, MainActivity::class.java).apply {
                        action = Intent.ACTION_VIEW
                        data = Uri.parse("ledger://widget?action=record")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    }
                    val recordPending = PendingIntent.getActivity(
                        context, 1, recordLink,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(R.id.btn_quick_record, recordPending)
                } catch (_: Exception) {
                }

                try {
                    mgr.updateAppWidget(appWidgetId, views)
                } catch (_: Exception) {
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        const val PREFS_NAME = "ledger_widget_prefs"
        const val KEY_DATA = "widget_data"

        @JvmStatic
        fun updateAllWidgets(context: Context) {
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, LedgerWidgetProvider::class.java))
                if (ids != null && ids.isNotEmpty()) {
                    val provider = LedgerWidgetProvider()
                    provider.updateWidgets(context, mgr, ids)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
