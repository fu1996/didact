/**
 * v4版本去解决v3版本中未实现的更新和删除操作
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
const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function createDom(fiber) {
  // 根据虚拟DOM类型创建真实DOM
  const dom =
    fiber.type == SPECIAL_TYPE.TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

// 下一个工作单元
let nextUnitOfWork = null;
// 循环更新的节点 work in progress root
let wipRoot = null;
// 当前的工作节点
let currentRoot = null;
// 记录删除的数组
let deletions = null;

/**
 * 一次性将当前fiber节点的变更，更新为 真实的 DOM
 */
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  // 暂存当前 fiber节点到 currentRoot
  currentRoot = wipRoot;
  // 循环更新的节点 置为空
  wipRoot = null;
console.log("渲染结束", wipRoot);
}

/**
 * 递归调用 将 fiber 节点更新到DOM上
 * @param {*} fiber
 */
function commitWork(fiber) {
  if (!fiber) return;
  const domParent = fiber.parent.dom;
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    domParent.removeChild(fiber.dom);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

/**
 *
 * @param {*} element VDom
 * @param {*} container 真实挂载的DOM节点
 */
function render(element, container) {
  console.log("事件循环的起点", element, container);
  // 即将开始工作的 基础单元
  wipRoot = {
    dom: container,
    props: {
      children: Array.isArray(element) ? [...element] : [element],
    },
    alternate: currentRoot,
  };
  // 新增记录删除的数组
  deletions = [];
  nextUnitOfWork = wipRoot;
}

function workLoop(deadline) {
  console.log("事件循环");
  // 是否可以继续工作
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // 剩余时间是否小于1
    const timeRemaining = deadline.timeRemaining();
    console.log("剩余时间", timeRemaining);
    // 如果此处的时间不足，可能导致多个节点时候的 performUnitOfWork 函数
    // 只进行了一半，就被浏览器打断了，导致界面上仅有部分节点。
    shouldYield = timeRemaining < 1;
  }
  // 如果下一个工作节点不存在，并且当前工作节点存在
  // 说明本次fiber节点更新结束 可以更新为 真实的 DOM
  if (!nextUnitOfWork && wipRoot) {
    console.time("渲染节点");
    commitRoot();
    console.timeEnd("渲染节点");
  }
  // 循环的核心在此处
  requestIdleCallback(workLoop);
}
// 类似于setTimeout，但是触发的时机 是浏览器 空闲时候进行调用一次。
requestIdleCallback(workLoop);

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;
  // 处理子节点
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;
    // 老 fiber 节点和当前节点是否是同一类型
    const sameType = oldFiber && element && element.type == oldFiber.type;
    // 如果旧节点和新节点的类型相同
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    // 当前节点存在，但是和老fiber节点的类型不同 做替换
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    // 旧 fiber节点存在 但是不和当前节点类型相同 做删除
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }
    // 旧 fiber节点的 相邻节点存在，将其赋值给 旧 fiber节点，实现下次遍历 从 旧fiber节点开始
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // 当前是第一个节点，child 绑定到自身
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }
}

/**
 * 在浏览器的一次循环中处理当前的vdom节点渲染到界面上，并返回下一个工作单元
 * @param {*} nextUnitOfWork
 */
function performUnitOfWork(fiber) {
  // 当前fiber节点 不存在真实DOM，生成一个真实的DOM
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 遍历子节点，继续执行 children 属性来自于 createElement 函数。
  const elements = fiber.props.children;
  // 调和fiber节点
  reconcileChildren(fiber, elements);
  // 存在子节点，返回子节点
  if (fiber.child) {
    return fiber.child;
  }
  // 1. 如果没有子节点，就查找兄弟节点
  let nextFiber = fiber;
  while (nextFiber) {
    // 3. 兄弟节点存在就返回
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 2. 一层一层向上查找兄弟节点
    nextFiber = nextFiber.parent;
  }
}

const Didact = {
  createElement,
  render,
};

/** @jsx Didact.createElement */
const container = document.getElementById("root");

const updateValue = (e) => {
  rerender(e.target.value);
};

const rerender = (value) => {
  const element = (
    <div style={{ background: "pink" }}>
      <input onInput={updateValue} value={value} />
      <h2>Hello {value}</h2>
    </div>
  );
  Didact.render(element, container);
};

rerender("World");
