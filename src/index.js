/**
 * 一旦我们开始渲染，我们就不会停止，直到渲染出完整的元素树。
 * 如果元素树很大，可能会阻塞主线程太长时间。
 * 如果浏览器需要执行高优先级的操作，例如处理用户输入或保持动画流畅，则必须等到渲染完成。
 */

const SPECIAL_TYPE = {
  TEXT_ELEMENT: "TEXT_ELEMENT",
};

/**
 * 把当前VDom以及VDom的子节点转为VDom
 * @param {*} type
 * @param {*} props
 * @param  {...any} children
 * @returns
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

/**
 * 文本节点要做特殊处理
 * @param {*} text
 * @returns
 */
function createTextElement(text) {
  return {
    type: SPECIAL_TYPE.TEXT_ELEMENT,
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
// 只把当前虚拟DOM的prop筛选出来
const isProperty = (key) => key !== "children";

/**
 * 把VDom转为真实DOM
 * @param {*} element
 * @param {*} container
 * @returns
 */
function render(element, container) {
  // 根据虚拟DOM类型创建真实DOM
  const dom =
    element.type == SPECIAL_TYPE.TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(element.type);

  Object.keys(element.props)
    .filter(isProperty)
    .forEach((name) => {
      // 虚拟DOM的 props 绑定到真实 DOM上
      dom[name] = element.props[name];
    });
  // 递归处理 进行绑定
  element.props.children.forEach((child) => render(child, dom));
  container.appendChild(dom);
}

const Didact = {
  createElement,
  render,
};

/** @jsx Didact.createElement */
const element = (
  <div style="background: salmon">
    <h1>Hello World</h1>
    <h2 style="text-align:right">from Didact</h2>
  </div>
);
const container = document.getElementById("root");
Didact.render(element, container);
