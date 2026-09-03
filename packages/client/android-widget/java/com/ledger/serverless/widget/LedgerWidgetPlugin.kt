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
            prefs.edit().putString(LedgerWidgetProvider.KEY_DATA, jsonStr).apply()

            // 主动触发桌面小组件刷新广播; ids 为空也视为成功 resolve
            // (用户尚未添加小组件到桌面时 ids 即为空,属正常情况)
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
                // 广播失败不影响 resolve,前端已持久化数据,系统轮询也会刷新
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
