package com.goodegg.randoz.keepalive

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** What the screen can do with KeepAliveService: start it, stop it, and hear it stop. */
class KeepAliveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepAlive")

    Events("onStopped")

    OnCreate {
      KeepAliveService.onStopped = { reason -> sendEvent("onStopped", mapOf("reason" to reason)) }
    }

    OnDestroy {
      KeepAliveService.onStopped = null
    }

    // Throws if Android refuses, as it does when the app is already in the background.
    Function("start") { title: String, text: String, stopLabel: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("The app is not running")
      val intent = Intent(context, KeepAliveService::class.java)
        .putExtra("title", title)
        .putExtra("text", text)
        .putExtra("stopLabel", stopLabel)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      val context = appContext.reactContext
      context?.stopService(Intent(context, KeepAliveService::class.java))
    }

    Function("isRunning") { KeepAliveService.running }
  }
}
