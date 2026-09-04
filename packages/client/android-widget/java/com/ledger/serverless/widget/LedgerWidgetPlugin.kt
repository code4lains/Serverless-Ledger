package com.ledger.serverless.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor 桥接插件:接收前端 WidgetPayload 并触发桌面小组件刷新。
 * 前端调用: LedgerWidget.updateWidgetData({ data: payload })
 */
@CapacitorPlugin(name = "LedgerWidget")
class LedgerWidgetPlugin : Plugin() {

    @PluginMethod
    fun updateWidgetData(call: PluginCall) {
        try {
            val data = call.getObject("data")
            if (data == null) {
                call.reject("Missing data payload")
                return
            }

            // JSObject -> String: 使用 toString() 得到 JSON 字符串持久化
            val jsonStr: String = data.toString()

            val prefs = context.getSharedPreferences(
                LedgerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
            )
            // 使用 commit() 保证同步落盘后再触发刷新
            prefs.edit().putString(LedgerWidgetProvider.KEY_DATA, jsonStr).commit()

            // 1. 就地直接更新 RemoteViews (无需排队等待广播调度，实现 0 延迟响应)
            try {
                LedgerWidgetProvider.updateAllWidgets(context)
            } catch (_: Exception) {
            }

            // 2. 主动触发系统桌面小组件广播更新
            val ids: IntArray = try {
                val mgr = AppWidgetManager.getInstance(context)
                mgr.getAppWidgetIds(ComponentName(context, LedgerWidgetProvider::class.java))
                    ?: intArrayOf()
            } catch (_: Exception) {
                intArrayOf()
            }

            try {
                val intent = Intent(context, LedgerWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            } catch (_: Exception) {
            }

            call.resolve()
        } catch (e: Exception) {
            try {
                call.reject("updateWidgetData failed: ${e.message}")
            } catch (_: Exception) {
            }
        }
    }
}
