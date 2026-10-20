package com.eltzy.app

// EL TZY • AEGIS-M — native bridge.
//  • SAF tree picker + stream copy (save anywhere without permissions)
//  • FileProvider share sheet for finished exports
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.eltzy.app/storage"
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "pickTree" -> {
                    pending = result
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                        addFlags(
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        )
                    }
                    startActivityForResult(intent, 777)
                }
                "copyToTree" -> {
                    try {
                        val tree = call.argument<String>("tree")
                            ?: return@setMethodCallHandler result.error("ARGS", "tree missing", null)
                        val src = call.argument<String>("src")
                            ?: return@setMethodCallHandler result.error("ARGS", "src missing", null)
                        val name = call.argument<String>("name")
                            ?: return@setMethodCallHandler result.error("ARGS", "name missing", null)
                        result.success(copyToTree(tree, src, name))
                    } catch (e: Exception) {
                        result.error("COPY_FAILED", e.message, null)
                    }
                }
                "shareFile" -> {
                    try {
                        val path = call.argument<String>("path")
                            ?: return@setMethodCallHandler result.error("ARGS", "path missing", null)
                        val mime = call.argument<String>("mime") ?: "audio/*"
                        shareFile(path, mime)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("SHARE_FAILED", e.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun shareFile(path: String, mime: String) {
        val file = File(path)
        val uri: Uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, file.name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Share export"))
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 777) {
            val res = pending
            pending = null
            if (resultCode == Activity.RESULT_OK && data?.data != null) {
                val uri = data.data!!
                try {
                    contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                } catch (_: Exception) {
                    // Some providers refuse persistence; the URI still works
                    // for this session.
                }
                res?.success(uri.toString())
            } else {
                res?.success(null)
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun copyToTree(tree: String, src: String, name: String): String {
        val doc = DocumentFile.fromTreeUri(this, Uri.parse(tree))
            ?: throw Exception("bad tree")
        doc.findFile(name)?.delete()
        val file = doc.createFile(mimeFor(name), name)
            ?: throw Exception("create failed")
        contentResolver.openOutputStream(file.uri)?.use { out ->
            File(src).inputStream().use { it.copyTo(out) }
        } ?: throw Exception("stream failed")
        return file.uri.toString()
    }

    private fun mimeFor(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "mp3" -> "audio/mpeg"
            "m4a" -> "audio/mp4"
            "ogg" -> "audio/ogg"
            "opus" -> "audio/opus"
            "flac" -> "audio/flac"
            "wav" -> "audio/wav"
            else -> "audio/*"
        }
    }
}
