(() => {
  // 使用一个唯一的名称以避免冲突
  if (window.unifiedVideoValidationPromise) {
    return;
  }

  // 在 window 对象上暴露一个 Promise，以便 Playwright 可以等待结果
  window.unifiedVideoValidationPromise = new Promise((resolve, reject) => {
    // 设置一个全局超时，以防万一
    const globalTimeoutTimer = setTimeout(() => {
      reject(new Error("Global validation timeout after 15s"));
    }, 15000);

    const validateVideo = (video) => {
      // --- 标准化 video 元素属性 ---
      video.autoplay = true;
      video.muted = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "");
      // -----------------------------------------

      new Promise((videoResolve, videoReject) => {
        if (video.error) {
          return videoReject();
        }
        if (video.readyState >= 3) {
          // HAVE_FUTURE_DATA
          return videoResolve(video);
        }

        let timeoutId = null;
        const cleanup = () => {
          clearTimeout(timeoutId);
          video.removeEventListener("canplay", onCanPlay);
          video.removeEventListener("error", onError);
        };

        const onCanPlay = () => {
          cleanup();
          videoResolve(video);
        };

        const onError = () => {
          cleanup();
          videoReject();
        };

        timeoutId = setTimeout(() => {
          cleanup();
          videoReject();
        }, 10000);

        video.addEventListener("canplay", onCanPlay);
        video.addEventListener("error", onError);

        video.load();
      })
        .then((validVideo) => {
          console.log("[validateVideoPlayability] success");
          clearTimeout(globalTimeoutTimer);
          resolve(true); // 解析主 Promise，表示成功
        })
        .catch((err) => {
          console.log("[validateVideoPlayability] failed");
        });
    };

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === "VIDEO") {
              validateVideo(node);
            } else if (typeof node.querySelectorAll === "function") {
              node.querySelectorAll("video").forEach(validateVideo);
            }
          });
        }
      }
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
    });
  });
})();
