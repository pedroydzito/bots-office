// If the app bundle fails to load (e.g. a stale page after a deploy), reload once.
      addEventListener('error', function (e) {
        var t = e.target
        if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK') && !sessionStorage.getItem('bo-reloaded')) {
          sessionStorage.setItem('bo-reloaded', '1')
          location.reload()
        }
      }, true)
      setTimeout(function () {
        if (document.getElementById('boot') && !sessionStorage.getItem('bo-reloaded')) {
          sessionStorage.setItem('bo-reloaded', '1')
          location.reload()
        }
      }, 12000)
