crystal_doc_search_index_callback({"repository_name":"send","body":"# send\n\n![Send.cr CI](https://img.shields.io/github/workflow/status/wyhaines/Send.cr/Send.cr%20CI?style=for-the-badge&logo=GitHub)\n[![GitHub release](https://img.shields.io/github/release/wyhaines/Send.cr.svg?style=for-the-badge)](https://github.com/wyhaines/Send.cr/releases)\n![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/wyhaines/Send.cr/latest?style=for-the-badge)\n\nCrystal looks and feels a lot like Ruby. However, pieces of the metaprogramming toolkits between the two languages are very different. The high level difference is that Ruby makes extensive use of facilities like `eval`, `method_missing`, and `send` to do its dynamic magic. And while Crystal does support `method_missing`, because of its compiled nature, most of Crystal's dynamic magic comes from the use of macros. Crystal does not support `eval` or  `send`.\n\nHowever...\n\nConsider this program:\n\n```crystal\nrequire \"secret_sauce\"\n\nclass Foo\n  def a(val : Int32)\n    val + 7\n  end\n\n  def b(x : Int32, y : Int32)\n    x * y\n  end\n\n  def c(val : Int32, val2 : Int32)\n    val * val2\n  end\n\n  def d(xx : String, yy : Int32) : UInt128\n    xx.to_i.to_u128 ** yy\n  end\n\n  include SecretSauce\nend\n\nf = Foo.new\nputs f.b(7, 9)\nputs \"------\"\nputs f.send(\"a\", 7)\nputs f.send(\"b\", 7, 9)\nputs f.send(\"d\", \"2\", 64)\n```\n\nWill it work? Of course! Why else would you be reading this?\n\n```\n63                          \n------\n14\n63\n18446744073709551616\n```\n\nIn this example, SecretSauce is a proof of concept implementation:\n\n```crystal\nmodule SecretSauce\n  SendLookupInt32 = {\n    \"a\": ->(obj : Foo, val : Int32) { obj.a(val) },\n  }\n\n  SendLookupInt32Int32 = {\n    \"b\": ->(obj : Foo, x : Int32, y : Int32) { obj.b(x, y) },\n    \"c\": ->(obj : Foo, val : Int32, val2 : Int32) { obj.c(val, val2) },\n  }\n\n  def send(method, arg1 : Int32)\n    SendLookupInt32[method].call(self, arg1)\n  end\n\n  def send(method, arg1 : Int32, arg2 : Int32)\n    SendLookupInt32Int32[method].call(self, arg1, arg2)\n  end\nend\n```\n\nIt works by creating a set of lookup tables that match method names to their argument type signature set.\n\nWhen paired with overloaded `#send` methods, one per argument type signature set, it is a fairly simple matter to lookup the method name, and to call the proc with the matching arguments.\n\nThat is essentially what this shard does for you. It leverages Crystal's powerful macro system to build code that is similar to the above examples. This, in turn, let's one utilize `#send` to do dynamic method dispatch.\n\nAnd while it might seem like this would slow down that method dispatch, the benchmarks prove otherwise. \n\n```\nBenchmarks...\n direct method invocation -- nulltest 927.30M (  1.08ns) (± 1.20%)  0.0B/op        fastest\nsend via record callsites -- nulltest 926.22M (  1.08ns) (± 1.85%)  0.0B/op   1.00x slower\n  send via proc callsites -- nulltest 367.63M (  2.72ns) (± 1.25%)  0.0B/op   2.52x slower\n direct method invocation 386.46M (  2.59ns) (± 1.17%)  0.0B/op        fastest\nsend via record callsites 384.89M (  2.60ns) (± 3.20%)  0.0B/op   1.00x slower\n  send via proc callsites 220.40M (  4.54ns) (± 1.57%)  0.0B/op   1.75x slowerr\n\n```\n\nFor all intents and purposes, when running code build with `--release`, the execution speed between the direct calls and the `#send` based calls is the same, when using *record* type callsites. It is somewhat slower when using *proc* type callsites, but the performance is still reasonably good.\n\n## Limitations\n\nThis approach currently has some significant limitations.\n\n### Methods can't be sent to if they do not have type definitions\n\nFirst, it will not work automatically on any method which does not have a type definition. Crystal must expand macros into code before type inference runs, so arguments with no provided method types lack the information needed to build the callsites.\n\nThis is because both of the techniques used to provide callsites, the use of *Proc* or the use of a *record*, require this type information. Proc arguments must have types, and will return a `Error: function argument ZZZ must have a type` if one is not provided. The *record* macro, on the other hand, builds instance variables for the arguments, which, again, require types to be provided at the time of declaration.\n\nA possible partial remediation that would allow one to retrofit the ability to use `send` with methods that aren't already defined with fully typing would be to enable the use of annotations to describe the type signature for the method. This would allow someone to reopen a class, attach type signatures to the methods that need them, and then include `Send` in the class to enable sending to those methods.\n\n### Methods that take blocks are currently unsupported\n\nThis can be supported. The code to do it is still just TODO.\n\n### Named argument support is flakey\n\nConsider two method definitions:\n\n```crystal\ndef a(b : Int32)\n  puts \"b is #{b}\"\nend\n\ndef a(c : Int32)\n  puts \"c is #{c}\"\nend\n```\n\nOnly the last one defined, `a(c : Int32)`, will exist in the compiled code. So if you have different methods with the same type signatures, only the last one defined can be addressed using named arguments.\n\nTODO is to see if there is a way to leverage splats and double splats in the send implementation so that all argument handling just works the way that one would expect.\n\n## Installation\n\n1. Add the dependency to your `shard.yml`:\n\n   ```yaml\n   dependencies:\n     send:\n       github: your-github-user/send\n   ```\n\n2. Run `shards install`\n\n## Usage\n\n```\nrequire \"send\"\n\nclass Foo\n  def abc(n : Int32)\n    n * 123\n  end\n\n  include Send\nend\n```\n\nWhen `Send` is included into a class, it will setup callsites for all methods that have been defined before that point, which have type definitions on their arguments. By default, this uses *record* callsites for everything. When compiled with `--release`, using *record* callsites is as fast as directly calling the method. If a method uses types that can not be used with an instance variable, but are otherwise legal method types, the *Proc* callsite type can be used instead.\n\nTo specify that the entire class should use one callsite type or another, use an annotation on the class.\n\n```\n@[SendViaProc]\nclass Foo\nend\n```\n\nThe `@[SendViaRecord]` annotation is also supported, but since that is the default, one should not need to use it at the class level.\n\nThese same annotations can also be used on methods to specify the `send` behavior for a given method.\n\n```\n@[SendViaProc]\nclass Foo\n  def abc(n : Int32)\n    n ** n\n  end\n\n  @[SendViaRecord]\n  def onetwothree(x : Int::Signed | Int::Unsigned, y : Int::Signed | Int::Unsigned)\n    BigInt.new(x) ** BigInt.new(y)\n  end\nend\n```\n\nThe \n\n## Development\n\nI am putting this here mostly as a note to myself, but the current approach is to iterate on the defined methods at the end of the class definition. It might be better if the code were included at the start of the class definition, since that is a pretty standard practice, and then to replace the iteration with a `method_added` hook that does all of the analysis and code generation for each method, one at a time.\n\n## Contributing\n\n1. Fork it (<https://github.com/wyhaines/send/fork>)\n2. Create your feature branch (`git checkout -b my-new-feature`)\n3. Commit your changes (`git commit -am 'Add some feature'`)\n4. Push to the branch (`git push origin my-new-feature`)\n5. Create a new Pull Request\n\n## Contributors\n\n- [Kirk Haines](https://github.com/wyhaines) - creator and maintainer\n\n![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/wyhaines/Send.cr?style=for-the-badge)\n![GitHub issues](https://img.shields.io/github/issues/wyhaines/Send.cr?style=for-the-badge)\n","program":{"html_id":"send/toplevel","path":"toplevel.html","kind":"module","full_name":"Top Level Namespace","name":"Top Level Namespace","abstract":false,"superclass":null,"ancestors":[],"locations":[],"repository_name":"send","program":true,"enum":false,"alias":false,"aliased":null,"aliased_html":null,"const":false,"constants":[],"included_modules":[],"extended_modules":[],"subclasses":[],"including_types":[],"namespace":null,"doc":null,"summary":null,"class_methods":[],"constructors":[],"instance_methods":[],"macros":[],"types":[{"html_id":"send/Send","path":"Send.html","kind":"module","full_name":"Send","name":"Send","abstract":false,"superclass":null,"ancestors":[],"locations":[{"filename":"src/send.cr","line_number":9,"url":null}],"repository_name":"send","program":false,"enum":false,"alias":false,"aliased":null,"aliased_html":null,"const":false,"constants":[{"id":"VERSION","name":"VERSION","value":"\"0.1.1\"","doc":null,"summary":null}],"included_modules":[],"extended_modules":[],"subclasses":[],"including_types":[],"namespace":null,"doc":null,"summary":null,"class_methods":[],"constructors":[],"instance_methods":[],"macros":[{"id":"build_callsites-macro","html_id":"build_callsites-macro","name":"build_callsites","doc":"There are two approaches to providing callsites for invoking methods\nwhich are currently provided by this library. One approach is to create\na bunch of Proc objects which wrap the method calls. The lookup tables\ncan be used to find the correct Proc to call. The other approach is to\ncreate a set of `record`s which take the same argument set as the method\nthat it maps to. A `call` method exists on the record, and when invoked,\nit calls the method using the arguments that were used to create the\nrecord.\n\nThis macro builds the callsites to send methods to. It defaults to using\nrecord structs to implement the callsites, but if passed a `true` when the\nmacro is invoked, it will build the callsite using a Proc instead. Callsites\nbuilt with a record are as fast as direct method invocations, when compiled\nwith `--release`, but they suffer from some type restrictions that the Proc\nmethod do not suffer from. Namely, there are some types, such as `Number`,\nwhich can be used in a type or type union on a Proc, but which can not be\nused on an instance variable, which record-type callsites use. However,\ndynamic dispatch using Proc-type callsites is slower than with record-type\ncallsites.","summary":"<p>There are two approaches to providing callsites for invoking methods which are currently provided by this library.</p>","abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":120,"url":null},"def":{"name":"build_callsites","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    \n{% use_procs = !(@type.annotations(SendViaProc)).empty? %}\n\n    \n{% for method in @type.methods.reject do |method|\n  method.args.any? do |arg|\n    arg.restriction.is_a?(Nop)\n  end\nend %}\n      {% method_args = method.args %}\n      {% method_name = method.name %}\n      {% if use_procs == true %}\n        Send_{{ method_name }}_{{ (MethodTypeLabel[method.args.symbolize].gsub(/::/, \"CXOLOXN\")).id }} = ->(obj : {{ @type.id }}, {{ (method_args.map do |arg|\n  \"#{arg.name} : #{arg.restriction}\"\nend.join(\", \")).id }}) do\n          obj.{{ method_name }}({{ (method_args.map(&.name).join(\", \")).id }})\n        end\n      {% else %}\n        record Send_{{ method_name }}_{{ (MethodTypeLabel[method.args.symbolize].gsub(/::/, \"CXOLOXN\")).id }}, obj : {{ @type.id }}, {{ (method_args.map do |arg|\n  \"#{arg.name} : #{arg.restriction}\"\nend.join(\", \")).id }} do\n          def call\n            obj.{{ method_name }}({{ (method_args.map(&.name).join(\", \")).id }})\n          end\n        end\n      {% end %}\n    {% end %}\n\n  \n"}},{"id":"build_lookup_constants-macro","html_id":"build_lookup_constants-macro","name":"build_lookup_constants","doc":null,"summary":null,"abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":92,"url":null},"def":{"name":"build_lookup_constants","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    \n{% combo_keys = SendRawCombos.keys %}\n\n    \n{% for constant_name in combo_keys %}\n    {% hsh = SendRawCombos[constant_name] %}\n    {{ constant_name.id }} = {\n      {% for method_name, callsite in hsh %}{{ method_name }}: {{ callsite.id }},\n      {% end %}}{% end %}\n\n  \n"}},{"id":"build_method_sends-macro","html_id":"build_method_sends-macro","name":"build_method_sends","doc":"Send needs to find the right method to call, in a world where type unions exist and are\ncommon. This may not be the right approach, but it is an approach, and it what I am starting\nwith.\n\nThe basic problem is that if, say, you have a method that takes a `String | Int32`, and you\nalso have a method that takes only an `Int32`, you will end up with two overloaded `send`\nmethods. If you try to send to the method that takes the union, using a `String`, it will\nwork as expected. However, if you try to send to the method that takes the union, using an\nInt32, the `send` that takes Int32 will be called, and it needs to be able to find the\nmethod that takes the union type.\n\nSo....how to do this?","summary":"<p>Send needs to find the right method to call, in a world where type unions exist and are common.</p>","abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":151,"url":null},"def":{"name":"build_method_sends","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    \n{% class_use_procs = !(@type.annotations(SendViaProc)).empty? %}\n\n    \n{% for constant, hsh in SendParameters %}\n    {% for signature, argn in hsh %}\n    {% args = argn[\"args\"]\nupn = argn[\"use_procs\"]\nif upn == \"Y\"\n  use_procs = true\nelse\n  if upn == \"N\"\n    use_procs = false\n  else\n    use_procs = class_use_procs\n  end\nend\n %}\n\n    def __send__(method : String, {{ signature.id }})\n      begin\n      {% if use_procs == true %}\n        {{ constant.id }}[method].call(self, {{ args.id }})\n      {% else %}\n        {{ constant.id }}[method].new(self, {{ args.id }}).call\n      {% end %}\n      rescue KeyError\n        raise MethodMissing.new(\"Can not send to '#{method}'; check that it exists and all arguments have type specifications.\")\n      end\n    end\n    def send(method : String, {{ signature.id }})\n      __send__(method, {{ args.id }})\n    end\n\n    def __send__?(method : String, {{ signature.id }})\n    begin\n      {% if use_procs == true %}\n        {{ constant.id }}[method].call(self, {{ args.id }})\n      {% else %}\n        {{ constant.id }}[method].new(self, {{ args.id }}).call\n      {% end %}\n      rescue KeyError\n        return nil\n      end\n    end\n    def send?(method : String, {{ signature.id }})\n      __send__?(method, {{ args.id }})\n    end\n\n    {% end %}\n    {% end %}\n\n  \n"}},{"id":"build_type_label_lookups-macro","html_id":"build_type_label_lookups-macro","name":"build_type_label_lookups","doc":"Yeah, I realize that there is a line here that is horrible. Forgive me.","summary":"<p>Yeah, I realize that there is a line here that is horrible.</p>","abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":15,"url":null},"def":{"name":"build_type_label_lookups","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    MethodTypeLabel = \n{\n    \n{% for method in @type.methods %}\n      {{ method.args.symbolize }} => {{ method.args.reject do |arg|\n  arg.restriction.is_a?(Nop)\nend.map do |arg|\n  arg.restriction.resolve.union? ? arg.restriction.resolve.union_types.map do |ut|\n    (ut.id.gsub(/[)(]/, \"\")).gsub(/\\ \\| /, \"_\")\n  end.join(\"_\") : (arg.restriction.id.gsub(/\\ \\| /, \"_\")).id\nend.join(\"__\") }},\n    {% end %}\n\n    }\n  \n"}},{"id":"build_type_lookups-macro","html_id":"build_type_lookups-macro","name":"build_type_lookups","doc":null,"summary":null,"abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":31,"url":null},"def":{"name":"build_type_lookups","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    \n{% src = {} of String => Hash(String, String)\nsends = {} of String => Hash(String, Hash(String, String))\n@type.methods.reject do |method|\n  method.args.any? do |arg|\n    arg.restriction.is_a?(Nop)\n  end\nend.map do |method|\n  MethodTypeLabel[method.args.symbolize]\nend.uniq.each do |restriction|\n  base = restriction.split(\"__\")\n  permutations = (restriction.split(\"__\")).map do |elem|\n    (elem.split(\"_\")).size\n  end.reduce(1) do |a, x|\n    a *= x\n  end\n  combos = [] of Array(String)\n  (1..permutations).each do\n    combos << ([] of String)\n  end\n  permutations_step = permutations\n  base.each do |b|\n    blen = (b.split(\"_\")).size\n    progression = permutations_step / blen\n    repeats = permutations / (progression * blen)\n    step = 0\n    (1..repeats).each do |repeat|\n      (b.split(\"_\")).each do |type|\n        (1..progression).each do |prog|\n          combos[step] << type\n          step += 1\n        end\n      end\n    end\n    permutations_step = progression\n  end\n  combos.each do |combo|\n    combo_string = (combo.join(\"__\")).id\n    constant_name = \"SendLookup___#{(combo.map do |c|\n      c.gsub(/::/, \"CXOLOXN\")\n    end.join(\"__\")).id}\"\n    @type.methods.reject do |method|\n      method.args.any? do |arg|\n        arg.restriction.is_a?(Nop)\n      end\n    end.each do |method|\n      if restriction == MethodTypeLabel[method.args.symbolize]\n        if !(method.annotations(SendViaProc)).empty?\n          use_procs = \"Y:\"\n        else\n          if !(method.annotations(SendViaRecord)).empty?\n            use_procs = \"N:\"\n          else\n            use_procs = \":\"\n          end\n        end\n        idx = -1\n        combo_arg_sig = method.args.map do |arg|\n          idx += 1\n          \"#{arg.name} : #{combo[idx].id}\"\n        end.join(\", \")\n        if !(src.keys.includes?(constant_name))\n          sends[constant_name] = {} of String => String\n          src[constant_name] = {} of String => String\n        end\n        signature = method.args.map do |arg|\n          \"#{arg.name} : #{arg.restriction}\"\n        end.join(\", \")\n        sends[constant_name][combo_arg_sig] = {\"args\" => method.args.map(&.name).join(\", \"), \"use_procs\" => use_procs}\n        src[constant_name][method.name.stringify] = \"Send_#{method.name}_#{(restriction.gsub(/::/, \"CXOLOXN\")).id}\"\n      end\n    end\n  end\nend\n %}\n\n    SendRawCombos = \n{{ src.stringify.id }}\n\n    SendParameters = \n{{ sends.stringify.id }}\n\n  \n"}},{"id":"send_init-macro","html_id":"send_init-macro","name":"send_init","doc":null,"summary":null,"abstract":false,"args":[],"args_string":"","location":{"filename":"src/send.cr","line_number":201,"url":null},"def":{"name":"send_init","args":[],"double_splat":null,"splat_index":null,"block_arg":null,"visibility":"Public","body":"    build_type_label_lookups\n    build_type_lookups\n    build_lookup_constants\n    build_callsites\n    build_method_sends\n  "}}],"types":[{"html_id":"send/Send/MethodMissing","path":"Send/MethodMissing.html","kind":"class","full_name":"Send::MethodMissing","name":"MethodMissing","abstract":false,"superclass":{"html_id":"send/Exception","kind":"class","full_name":"Exception","name":"Exception"},"ancestors":[{"html_id":"send/Exception","kind":"class","full_name":"Exception","name":"Exception"},{"html_id":"send/Reference","kind":"class","full_name":"Reference","name":"Reference"},{"html_id":"send/Object","kind":"class","full_name":"Object","name":"Object"}],"locations":[{"filename":"src/send.cr","line_number":12,"url":null}],"repository_name":"send","program":false,"enum":false,"alias":false,"aliased":null,"aliased_html":null,"const":false,"constants":[],"included_modules":[],"extended_modules":[],"subclasses":[],"including_types":[],"namespace":{"html_id":"send/Send","kind":"module","full_name":"Send","name":"Send"},"doc":null,"summary":null,"class_methods":[],"constructors":[],"instance_methods":[],"macros":[],"types":[]}]},{"html_id":"send/SendViaProc","path":"SendViaProc.html","kind":"annotation","full_name":"SendViaProc","name":"SendViaProc","abstract":false,"superclass":null,"ancestors":[],"locations":[{"filename":"src/send.cr","line_number":3,"url":null}],"repository_name":"send","program":false,"enum":false,"alias":false,"aliased":null,"aliased_html":null,"const":false,"constants":[],"included_modules":[],"extended_modules":[],"subclasses":[],"including_types":[],"namespace":null,"doc":null,"summary":null,"class_methods":[],"constructors":[],"instance_methods":[],"macros":[],"types":[]},{"html_id":"send/SendViaRecord","path":"SendViaRecord.html","kind":"annotation","full_name":"SendViaRecord","name":"SendViaRecord","abstract":false,"superclass":null,"ancestors":[],"locations":[{"filename":"src/send.cr","line_number":6,"url":null}],"repository_name":"send","program":false,"enum":false,"alias":false,"aliased":null,"aliased_html":null,"const":false,"constants":[],"included_modules":[],"extended_modules":[],"subclasses":[],"including_types":[],"namespace":null,"doc":null,"summary":null,"class_methods":[],"constructors":[],"instance_methods":[],"macros":[],"types":[]}]}})