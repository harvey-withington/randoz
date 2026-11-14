package com.goodegg.randoz.keepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the app's process running while it is off the screen, so the core
 * stays connected and photos keep arriving. Android allows that only for a
 * service that shows a notification for as long as it runs.
 *
 * It does no work itself: the core runs in the same process. The
 * notification opens the app when tapped and has one action, which stops
 * the service; the app then lets the core sleep as it would have anyway.
 */
class KeepAliveService : Service() {
  companion object {
    const val ACTION_STOP = "com.goodegg.randoz.keepalive.STOP"
    private const val CHANNEL = "connection"
    private const val NOTIFICATION_ID = 4201

    @Volatile var running = false

    /** Told why the service stopped by itself: "user" or "timeout". */
    @Volatile var onStopped: ((String) -> Unit)? = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      finish("user")
      return START_NOT_STICKY
    }

    val notification = build(
      intent?.getStringExtra("title") ?: "RANDOZ",
      intent?.getStringExtra("text") ?: "",
      intent?.getStringExtra("stopLabel") ?: "Stop"
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    running = true
    // If Android kills the process, do not bring the service back without the app.
    return START_NOT_STICKY
  }

  /** Android 15 and later stop a data-sync service after six hours in a day. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    finish("timeout")
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun finish(reason: String) {
    onStopped?.invoke(reason)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun build(title: String, text: String, stopLabel: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Low importance: no sound, no pop-up, just the entry in the shade.
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Connection", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val immutable = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val stop = Intent(this, KeepAliveService::class.java).setAction(ACTION_STOP)

    val builder = NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(0, stopLabel, PendingIntent.getService(this, 1, stop, immutable))
    if (open != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, open, immutable))
    return builder.build()
  }
}
