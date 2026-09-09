(function(){
  try{
    var saved = localStorage.getItem('sattva-theme');
    var theme = saved || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }catch(e){}
})();
