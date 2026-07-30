/// <reference types='@dcloudio/types' />
import 'vue'

declare module '@vue/runtime-core' {
  type Hooks = App.AppInstance & Page.PageInstance;

  interface ComponentCustomOptions extends Hooks {

  }
}

declare module '*.scss' {
  const content: any;
  export default content;
}
declare module '*.css' {
  const content: any;
  export default content;
}
